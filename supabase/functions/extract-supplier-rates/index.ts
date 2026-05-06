// Extract supplier rates (price list) from uploaded tarifários using Lovable AI.
// Body: { supplier_id?: string, document_id?: string, all?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mammoth from "https://esm.sh/mammoth@1.8.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";
const CHUNK_CHARS = 14000;
const MAX_CHUNKS = 6;

async function extractTextFromFile(buf: ArrayBuffer, format: string): Promise<string> {
  if (format === "docx") {
    const r = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return r.value || "";
  }
  if (format === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : (text as string);
  }
  if (format === "xlsx" || format === "xls") {
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      parts.push(`### Sheet: ${name}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[name]));
    }
    return parts.join("\n\n");
  }
  return "";
}

function chunks(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length && out.length < MAX_CHUNKS; i += CHUNK_CHARS) {
    out.push(text.slice(i, i + CHUNK_CHARS));
  }
  return out;
}

async function aiExtractRates(apiKey: string, chunk: string, supplierName: string, defaultCurrency: string) {
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "Você extrai preços de tarifários de fornecedores de turismo (transfers, tours, hotéis, restaurantes). Para cada serviço com preço claro, gere uma linha. Pule descritivos sem preço. Use a função fornecida." },
        { role: "user", content: `Fornecedor: ${supplierName}\nMoeda padrão se não indicada: ${defaultCurrency}\n\nTrecho do tarifário:\n${chunk}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "set_rates",
          parameters: {
            type: "object",
            properties: {
              rates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    service_name: { type: "string" },
                    service_type: { type: "string", enum: ["transfer", "tour", "hotel", "restaurant", "outro"] },
                    city: { type: "string" },
                    category: { type: "string" },
                    language: { type: "string" },
                    pax_min: { type: "number" },
                    pax_max: { type: "number" },
                    unit_price: { type: "number" },
                    currency: { type: "string", enum: ["BRL", "USD", "EUR"] },
                    unit: { type: "string", enum: ["per_person", "per_group", "per_vehicle", "per_night"] },
                    raw_excerpt: { type: "string" },
                  },
                  required: ["service_name", "unit_price"],
                },
              },
            },
            required: ["rates"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "set_rates" } },
    }),
  });
  if (!resp.ok) throw new Error(`AI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return args ? JSON.parse(args) : { rates: [] };
}

async function processDoc(supabase: any, apiKey: string, doc: any) {
  const fmt = (doc.file_format || "").toLowerCase();
  if (!["pdf", "docx", "xlsx", "xls"].includes(fmt)) {
    await supabase.from("supplier_documents").update({ rates_extracted_at: new Date().toISOString() }).eq("id", doc.id);
    return { rates: 0, skipped: "format" };
  }
  const { data: signed } = await supabase.storage.from("supplier-docs").createSignedUrl(doc.storage_path, 60);
  if (!signed?.signedUrl) throw new Error("no signed url");
  const r = await fetch(signed.signedUrl);
  const buf = await r.arrayBuffer();
  const text = await extractTextFromFile(buf, fmt);
  if (!text || text.length < 30) {
    await supabase.from("supplier_documents").update({ rates_extracted_at: new Date().toISOString() }).eq("id", doc.id);
    return { rates: 0, skipped: "no_text" };
  }
  const { data: sup } = await supabase.from("suppliers").select("id, name, default_currency").eq("id", doc.supplier_id).single();

  let totalInserted = 0;
  for (const c of chunks(text)) {
    const out = await aiExtractRates(apiKey, c, sup.name, sup.default_currency || "USD");
    const rows = (out.rates || []).filter((x: any) => x.service_name && typeof x.unit_price === "number" && x.unit_price > 0).map((x: any) => ({
      supplier_id: doc.supplier_id,
      document_id: doc.id,
      service_name: x.service_name.slice(0, 500),
      service_type: x.service_type || null,
      city: x.city || null,
      category: x.category || null,
      language: x.language || null,
      pax_min: x.pax_min ?? null,
      pax_max: x.pax_max ?? null,
      unit_price: x.unit_price,
      currency: x.currency || sup.default_currency || "USD",
      unit: x.unit || "per_person",
      raw_excerpt: x.raw_excerpt?.slice(0, 1000) || null,
    }));
    if (rows.length) {
      // batch insert
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("supplier_rates").insert(rows.slice(i, i + 100));
        if (!error) totalInserted += Math.min(100, rows.length - i);
      }
    }
  }
  await supabase.from("supplier_documents").update({ rates_extracted_at: new Date().toISOString() }).eq("id", doc.id);
  return { rates: totalInserted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { supplier_id, document_id, all } = await req.json().catch(() => ({}));
    let q = supabase.from("supplier_documents").select("*").is("rates_extracted_at", null).eq("kind", "tarifario");
    if (document_id) q = supabase.from("supplier_documents").select("*").eq("id", document_id);
    else if (supplier_id) q = q.eq("supplier_id", supplier_id);
    else if (!all) throw new Error("supplier_id, document_id or all required");
    const { data: docs, error } = await q;
    if (error) throw error;
    const results: any[] = [];
    for (const doc of (docs || [])) {
      try {
        const r = await processDoc(supabase, LOVABLE_API_KEY, doc);
        results.push({ document_id: doc.id, name: doc.original_filename, ...r });
      } catch (e) {
        results.push({ document_id: doc.id, error: (e as Error).message });
      }
    }
    return new Response(JSON.stringify({ ok: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
