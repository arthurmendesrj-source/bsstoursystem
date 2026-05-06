import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import fs from "node:fs/promises";
import path from "node:path";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const LK = process.env.LOVABLE_API_KEY;

if (!URL || !KEY) throw new Error("Credenciais do backend ausentes no ambiente.");
if (!LK) throw new Error("LOVABLE_API_KEY ausente no ambiente.");

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const BUCKET = "supplier-docs";
const MANIFEST = "/mnt/documents/hoteis_upload_manifest.json";
const EXTRACTED_PATH = "/mnt/documents/hoteis_extracted.json";
const ERRORS_PATH = "/mnt/documents/hoteis_extraction_errors.json";
const REPORT = "/mnt/documents/hoteis_phase2_report.json";

const norm = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s) => norm(s).replace(/\s+/g, "-").slice(0, 80);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function downloadFromStorage(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`Storage download ${storagePath}: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function extractPdfTextFromBuffer(buffer) {
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return (text || "").slice(0, 18000);
}

const TOOL = {
  type: "function",
  function: {
    name: "extract_hotel_info",
    description: "Extract structured hotel supplier info from a tariff/brochure PDF text.",
    parameters: {
      type: "object",
      properties: {
        hotel_name: { type: "string", description: "Canonical hotel/unit name. For a network PDF, use the unit name when the PDF is for one unit." },
        trade_name: { type: "string" },
        address_city: { type: "string" },
        address_state: { type: "string" },
        address_country: { type: "string" },
        full_address: { type: "string" },
        emails: { type: "array", items: { type: "string" } },
        phones: { type: "array", items: { type: "string" } },
        whatsapp: { type: "array", items: { type: "string" } },
        website: { type: "string" },
        default_currency: { type: "string", description: "ISO code: BRL, USD, EUR, ARS, PEN, etc." },
        tax_id: { type: "string", description: "CNPJ/RUC/etc." },
        year: { type: "integer" },
        is_multi_unit: { type: "boolean", description: "True if the PDF lists multiple distinct hotel units." },
        units: {
          type: "array",
          description: "When is_multi_unit is true, one entry per hotel/unit. Networks must be split per unit.",
          items: {
            type: "object",
            properties: {
              hotel_name: { type: "string" },
              address_city: { type: "string" },
              address_country: { type: "string" },
              address_state: { type: "string" }
            },
            required: ["hotel_name"]
          }
        },
        notes: { type: "string" }
      },
      required: ["hotel_name"]
    }
  }
};

async function aiExtract(text, hint) {
  const sys = [
    "You extract supplier data for hotels from tariff/brochure PDFs.",
    "Always call the extract_hotel_info tool and return only reliable data.",
    "Use the filename/folder hint as a strong prior for hotel name, city, country, and year.",
    "If a PDF belongs to a network and lists multiple units (Casa Andina, Sonesta, GHL, Wish, Nacionalinn, Windsor), set is_multi_unit=true and fill units[].",
    "The user explicitly wants PDFs from the same hotel across years grouped as one supplier, but networks split as one supplier per unit.",
    "Currency: detect from prices (R$=BRL, US$/USD=USD, S/=PEN, AR$=ARS)."
  ].join(" ");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LK}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Hint from filename/folder: ${JSON.stringify(hint)}\n\nPDF TEXT:\n${text}` }
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "extract_hotel_info" } }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`AI ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }

  const j = await res.json();
  const call = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("No tool call: " + JSON.stringify(j).slice(0, 400));
  return JSON.parse(call.function.arguments);
}

function groupKey(name, city, country) {
  return `${slug(name)}|${slug(city || country || "")}`;
}

function pickCurrency(c) {
  if (!c) return "BRL";
  const u = String(c).trim().toUpperCase();
  if (["BRL", "USD", "EUR", "ARS", "CLP", "PEN", "UYU", "COP", "MXN", "GBP", "CAD"].includes(u)) return u;
  return "BRL";
}

function firstNonEmpty(arr) {
  for (const value of arr || []) {
    if (value && String(value).trim()) return String(value).trim();
  }
  return null;
}

function uniqueDocs(docs) {
  const seen = new Set();
  return docs.filter((doc) => {
    const key = doc.manifest.storage_path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractAll() {
  const manifest = await readJson(MANIFEST, []);
  const extracted = await readJson(EXTRACTED_PATH, []);
  const errors = await readJson(ERRORS_PATH, []);
  const done = new Set(extracted.map((entry) => entry.manifest?.storage_path).filter(Boolean));

  console.log(`Manifest entries: ${manifest.length}`);
  console.log(`Already extracted: ${done.size}`);

  for (let i = 0; i < manifest.length; i++) {
    const m = manifest[i];
    if (done.has(m.storage_path)) {
      console.log(`[${i + 1}/${manifest.length}] ${m.original_filename} ... SKIP`);
      continue;
    }

    process.stdout.write(`[${i + 1}/${manifest.length}] ${m.original_filename} ... `);
    try {
      const buffer = await downloadFromStorage(m.storage_path);
      const text = await extractPdfTextFromBuffer(buffer);
      if (text.length < 50) {
        console.log("EMPTY TEXT");
        errors.push({ storage_path: m.storage_path, file: m.original_filename, error: "EMPTY TEXT" });
        await writeJson(ERRORS_PATH, errors);
        continue;
      }

      const hint = {
        filename: m.original_filename,
        hotel_folder: m.hotel_folder,
        city_or_country: m.city || m.country,
        country: m.country,
        year: m.year
      };

      let info;
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          info = await aiExtract(text, hint);
          break;
        } catch (error) {
          lastErr = error;
          if (error.status === 402) throw error;
          await sleep(1500 * (attempt + 1));
        }
      }

      if (!info) {
        console.log("AI FAIL", lastErr?.message?.slice(0, 160));
        errors.push({ storage_path: m.storage_path, file: m.original_filename, error: lastErr?.message || "AI FAIL" });
        await writeJson(ERRORS_PATH, errors);
        continue;
      }

      extracted.push({ manifest: m, info });
      done.add(m.storage_path);
      await writeJson(EXTRACTED_PATH, extracted);
      console.log(`OK -> ${info.hotel_name}${info.is_multi_unit ? ` (multi:${info.units?.length || 0})` : ""}`);
    } catch (error) {
      console.log("ERR", error.message?.slice(0, 180));
      errors.push({ storage_path: m.storage_path, file: m.original_filename, error: error.message });
      await writeJson(ERRORS_PATH, errors);
      if (error.status === 402) {
        console.log("Saldo de AI insuficiente. Progresso parcial salvo.");
        break;
      }
    }
  }

  console.log(`\nExtracted: ${extracted.length}/${manifest.length}`);
  return extracted;
}

async function findExistingSupplier(group) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, address_city, category")
    .eq("category", "hotel")
    .ilike("name", group.hotel_name);
  if (error) throw new Error(`Find supplier ${group.hotel_name}: ${error.message}`);
  return data?.find((supplier) => slug(supplier.address_city || "") === slug(group.address_city || "")) || null;
}

async function ensureStorageCopy(oldPath, newPath) {
  const copied = await supabase.storage.from(BUCKET).copy(oldPath, newPath);
  if (!copied.error) return newPath;

  const { data: existing } = await supabase.storage.from(BUCKET).list(path.dirname(newPath), {
    search: path.basename(newPath),
    limit: 1
  });
  if (existing?.some((item) => item.name === path.basename(newPath))) return newPath;

  throw new Error(`Storage copy ${oldPath} -> ${newPath}: ${copied.error.message}`);
}

async function documentAlreadyExists(supplierId, storagePath) {
  const { data, error } = await supabase
    .from("supplier_documents")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("storage_path", storagePath)
    .limit(1);
  if (error) throw new Error(`Check document ${storagePath}: ${error.message}`);
  return Boolean(data?.length);
}

async function insertSuppliers(extracted) {
  const groups = new Map();
  const addToGroup = (name, city, country, state, meta, docRef) => {
    const safeName = name || docRef.manifest.hotel_folder || docRef.manifest.original_filename.replace(/\.pdf$/i, "");
    const key = groupKey(safeName, city, country);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        hotel_name: safeName,
        address_city: city || null,
        address_country: country || null,
        address_state: state || null,
        meta: { ...meta },
        docs: []
      });
    }

    const group = groups.get(key);
    for (const [metaKey, value] of Object.entries(meta || {})) {
      if ((!group.meta[metaKey] || (Array.isArray(group.meta[metaKey]) && group.meta[metaKey].length === 0)) && value) {
        group.meta[metaKey] = value;
      }
    }
    group.docs.push(docRef);
  };

  for (const entry of extracted) {
    const info = entry.info || {};
    const meta = {
      trade_name: info.trade_name,
      full_address: info.full_address,
      emails: info.emails || [],
      phones: info.phones || [],
      whatsapp: info.whatsapp || [],
      website: info.website,
      default_currency: info.default_currency,
      tax_id: info.tax_id,
      notes: info.notes
    };

    if (info.is_multi_unit && Array.isArray(info.units) && info.units.length > 0) {
      for (const unit of info.units) {
        addToGroup(unit.hotel_name, unit.address_city, unit.address_country || info.address_country, unit.address_state || info.address_state, meta, entry);
      }
    } else {
      addToGroup(info.hotel_name, info.address_city, info.address_country, info.address_state, meta, entry);
    }
  }

  console.log(`Groups (suppliers to create/update): ${groups.size}`);
  const report = { created: [], updated: [], docsAttached: 0, docsSkipped: 0, errors: [] };

  for (const group of groups.values()) {
    try {
      const meta = group.meta;
      const notesParts = [];
      if (meta.full_address) notesParts.push(`Endereço: ${meta.full_address}`);
      if (meta.notes) notesParts.push(meta.notes);

      const payload = {
        name: group.hotel_name,
        trade_name: meta.trade_name || null,
        category: "hotel",
        status: "ativo",
        address_city: group.address_city,
        address_state: group.address_state,
        address_country: group.address_country,
        email: firstNonEmpty(meta.emails),
        phone: firstNonEmpty(meta.phones),
        whatsapp: firstNonEmpty(meta.whatsapp),
        website: meta.website || null,
        default_currency: pickCurrency(meta.default_currency),
        tax_id: meta.tax_id || null,
        notes: notesParts.join("\n\n") || null
      };

      const existing = await findExistingSupplier(group);
      let supplierId = existing?.id || null;

      if (!supplierId) {
        const { data, error } = await supabase.from("suppliers").insert(payload).select("id").single();
        if (error) throw new Error(`Insert supplier ${group.hotel_name}: ${error.message}`);
        supplierId = data.id;
        report.created.push({ id: supplierId, name: group.hotel_name, city: group.address_city, docs: uniqueDocs(group.docs).length });
      } else {
        const updatePayload = {};
        for (const [key, value] of Object.entries(payload)) {
          if (value && key !== "name" && key !== "category" && key !== "status") updatePayload[key] = value;
        }
        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase.from("suppliers").update(updatePayload).eq("id", supplierId);
          if (error) throw new Error(`Update supplier ${group.hotel_name}: ${error.message}`);
        }
        report.updated.push({ id: supplierId, name: group.hotel_name, city: group.address_city, docs: uniqueDocs(group.docs).length });
      }

      for (const doc of uniqueDocs(group.docs)) {
        const manifest = doc.manifest;
        const newPath = `${supplierId}/${path.basename(manifest.storage_path)}`;
        const finalPath = await ensureStorageCopy(manifest.storage_path, newPath);

        if (await documentAlreadyExists(supplierId, finalPath)) {
          report.docsSkipped++;
          continue;
        }

        const { error: docError } = await supabase.from("supplier_documents").insert({
          supplier_id: supplierId,
          original_filename: manifest.original_filename,
          storage_path: finalPath,
          file_format: "pdf",
          file_size_bytes: manifest.size || null,
          kind: "tarifario",
          year: manifest.year || null,
          notes: manifest.source_path || null
        });
        if (docError) throw new Error(`Insert document ${manifest.original_filename}: ${docError.message}`);
        report.docsAttached++;
      }
    } catch (error) {
      report.errors.push({ group: group.key, name: group.hotel_name, error: error.message });
      console.log("GROUP ERR", group.hotel_name, error.message?.slice(0, 180));
    }
  }

  await writeJson(REPORT, report);
  console.log(`\nCreated: ${report.created.length} | Updated: ${report.updated.length} | Docs: ${report.docsAttached} | Skipped docs: ${report.docsSkipped} | Errors: ${report.errors.length}`);
  console.log(`Report: ${REPORT}`);
  return report;
}

const extracted = await extractAll();
if (extracted.length > 0) await insertSuppliers(extracted);
else console.log("Nenhuma extração disponível para inserir fornecedores.");
