import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import fs from "node:fs/promises";
import path from "node:path";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LK = process.env.LOVABLE_API_KEY;
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const ROOT = "/tmp/hoteis_unzipped";
const BUCKET = "supplier-docs";
const MANIFEST = "/mnt/documents/hoteis_upload_manifest.json";
const REPORT = "/mnt/documents/hoteis_phase2_report.json";

const decodeName = (s) => s.replace(/#U([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s) => norm(s).replace(/\s+/g, "-").slice(0, 80);

async function findLocal(sourcePath) {
  const candidates = [
    path.join(ROOT, sourcePath),
    path.join(ROOT, decodeName(sourcePath)),
  ];
  // also try without "HOTEIS /" prefix or with
  for (const c of candidates) {
    try { await fs.access(c); return c; } catch {}
  }
  // fallback: walk and match basename
  const base = path.basename(sourcePath);
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { const r = await walk(p); if (r) return r; }
      else if (e.name === base || decodeName(e.name) === base) return p;
    }
    return null;
  }
  return await walk(ROOT);
}

async function extractPdfText(filePath) {
  const buf = await fs.readFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
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
        hotel_name: { type: "string", description: "Canonical hotel name (the unit, not the network). Example: 'Casa Andina Premium Cusco', not 'Casa Andina'." },
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
        tax_id: { type: "string", description: "CNPJ/RUC/etc" },
        year: { type: "integer" },
        is_multi_unit: { type: "boolean", description: "True if PDF lists multiple distinct hotels/units." },
        units: {
          type: "array",
          description: "When is_multi_unit, one entry per unit.",
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
  const sys = "You extract supplier (hotel) data from tariff/brochure PDFs. Always call the extract_hotel_info tool. Use the hint as a strong prior for the unit name and city. If the PDF is from a network (Casa Andina, Sonesta, GHL, Wish, Nacionalinn) listing multiple units, set is_multi_unit=true and fill units[]. Currency: detect from prices (R$=BRL, US$/USD=USD, S/=PEN, AR$=ARS).";
  const userMsg = `Hint from filename/folder: ${JSON.stringify(hint)}\n\nPDF TEXT:\n${text}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LK}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "extract_hotel_info" } }
    })
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const call = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("No tool call: " + JSON.stringify(j).slice(0, 400));
  return JSON.parse(call.function.arguments);
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
console.log(`Manifest entries: ${manifest.length}`);

// ---- Phase 2a: extract per-file ----
const extracted = [];
for (let i = 0; i < manifest.length; i++) {
  const m = manifest[i];
  process.stdout.write(`[${i+1}/${manifest.length}] ${m.original_filename} ... `);
  try {
    const local = await findLocal(m.source_path);
    if (!local) { console.log("LOCAL NOT FOUND"); continue; }
    const text = await extractPdfText(local);
    if (text.length < 50) { console.log("EMPTY TEXT"); continue; }
    const hint = {
      filename: m.original_filename,
      hotel_folder: m.hotel_folder,
      city_or_country: m.country,
      year: m.year
    };
    let info; let lastErr;
    for (let a = 0; a < 3; a++) {
      try { info = await aiExtract(text, hint); break; }
      catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (a+1))); }
    }
    if (!info) { console.log("AI FAIL", lastErr?.message?.slice(0,120)); continue; }
    extracted.push({ manifest: m, info });
    console.log(`OK -> ${info.hotel_name}${info.is_multi_unit ? ` (multi:${info.units?.length||0})` : ""}`);
  } catch (e) {
    console.log("ERR", e.message?.slice(0, 160));
  }
}

await fs.writeFile("/mnt/documents/hoteis_extracted.json", JSON.stringify(extracted, null, 2));
console.log(`\nExtracted: ${extracted.length}/${manifest.length}`);

// ---- Phase 2b: group ----
// Strategy:
// - If is_multi_unit: 1 supplier per unit; the same source PDF gets attached to ALL those suppliers.
// - Else: group by slug(hotel_name + "|" + city) so VIVAZ 2025+2026+2027 -> 1 supplier.

function groupKey(name, city, country) {
  return `${slug(name)}|${slug(city || country || "")}`;
}

const groups = new Map(); // key -> { name, city, country, meta:{}, docs:[{manifest, info}] }
function addToGroup(name, city, country, state, meta, docRef) {
  const k = groupKey(name, city, country);
  if (!groups.has(k)) {
    groups.set(k, {
      key: k,
      hotel_name: name,
      address_city: city || null,
      address_country: country || null,
      address_state: state || null,
      meta: { ...meta },
      docs: []
    });
  }
  const g = groups.get(k);
  // merge meta: prefer non-empty existing, else use new
  for (const [kk, vv] of Object.entries(meta || {})) {
    if (!g.meta[kk] && vv) g.meta[kk] = vv;
  }
  g.docs.push(docRef);
}

for (const e of extracted) {
  const i = e.info;
  const baseMeta = {
    trade_name: i.trade_name,
    full_address: i.full_address,
    emails: i.emails || [],
    phones: i.phones || [],
    whatsapp: i.whatsapp || [],
    website: i.website,
    default_currency: i.default_currency,
    tax_id: i.tax_id,
    notes: i.notes
  };
  if (i.is_multi_unit && Array.isArray(i.units) && i.units.length > 0) {
    for (const u of i.units) {
      addToGroup(u.hotel_name, u.address_city, u.address_country || i.address_country, u.address_state, baseMeta, e);
    }
  } else {
    addToGroup(i.hotel_name, i.address_city, i.address_country, i.address_state, baseMeta, e);
  }
}

console.log(`Groups (suppliers to create/update): ${groups.size}`);

// ---- Phase 2c: dedup against existing suppliers + insert ----
function pickCurrency(c) {
  if (!c) return "BRL";
  const u = c.toUpperCase();
  if (["BRL","USD","EUR","ARS","CLP","PEN","UYU","COP","MXN","GBP","CAD"].includes(u)) return u;
  return "BRL";
}
function firstNonEmpty(arr) { for (const v of arr) if (v) return v; return null; }

const report = { created: [], updated: [], docsAttached: 0, errors: [] };

for (const g of groups.values()) {
  try {
    const meta = g.meta;
    const namedSlug = slug(g.hotel_name);
    // try to find existing by name+city
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id, name, address_city, category, notes, currency")
      .eq("category", "hotel")
      .ilike("name", g.hotel_name);
    let supplierId = existing?.find(s => slug(s.address_city || "") === slug(g.address_city || ""))?.id || null;

    const payload = {
      name: g.hotel_name,
      trade_name: meta.trade_name || null,
      category: "hotel",
      status: "ativo",
      address_city: g.address_city,
      address_state: g.address_state,
      address_country: g.address_country,
      address_full: meta.full_address || null,
      email: firstNonEmpty(meta.emails || []),
      phone: firstNonEmpty(meta.phones || []),
      whatsapp: firstNonEmpty(meta.whatsapp || []),
      website: meta.website || null,
      currency: pickCurrency(meta.default_currency),
      tax_id: meta.tax_id || null,
      notes: meta.notes || null
    };

    if (!supplierId) {
      const { data, error } = await supabase.from("suppliers").insert(payload).select("id").single();
      if (error) { report.errors.push({ g: g.key, error: error.message }); continue; }
      supplierId = data.id;
      report.created.push({ id: supplierId, name: g.hotel_name, city: g.address_city, docs: g.docs.length });
    } else {
      // light merge update
      const upd = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v && (k === "name" || k === "category") === false) upd[k] = v;
      }
      await supabase.from("suppliers").update(upd).eq("id", supplierId);
      report.updated.push({ id: supplierId, name: g.hotel_name, city: g.address_city, docs: g.docs.length });
    }

    // attach documents: move from pending/ to <supplierId>/
    for (const d of g.docs) {
      const m = d.manifest;
      const oldPath = m.storage_path;
      const newPath = `${supplierId}/${path.basename(oldPath)}`;
      // copy via move (idempotent-ish: ignore if missing)
      const mv = await supabase.storage.from(BUCKET).move(oldPath, newPath);
      let finalPath = newPath;
      if (mv.error) {
        // maybe already moved on a prior run; try use existing newPath
        finalPath = newPath;
      }
      const { error: docErr } = await supabase.from("supplier_documents").insert({
        supplier_id: supplierId,
        original_filename: m.original_filename,
        storage_path: finalPath,
        file_format: "pdf",
        file_size_bytes: m.size,
        kind: "tarifario",
        year: m.year || null,
        notes: m.source_path
      });
      if (docErr) report.errors.push({ supplierId, file: m.original_filename, error: docErr.message });
      else report.docsAttached++;
    }
  } catch (e) {
    report.errors.push({ g: g.key, error: e.message });
  }
}

await fs.writeFile(REPORT, JSON.stringify(report, null, 2));
console.log(`\nCreated: ${report.created.length} | Updated: ${report.updated.length} | Docs: ${report.docsAttached} | Errors: ${report.errors.length}`);
console.log(`Report: ${REPORT}`);
