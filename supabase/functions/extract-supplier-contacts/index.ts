// Extract supplier contacts from uploaded documents using Lovable AI.
// Body: { supplier_id?: string, document_id?: string, all?: boolean }
// - If document_id: process only that doc
// - If supplier_id: process all unprocessed docs of that supplier
// - If all: process all unprocessed docs across all suppliers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mammoth from "https://esm.sh/mammoth@1.8.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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
  return "";
}

async function aiExtract(apiKey: string, text: string, supplierName: string) {
  const sample = text.slice(0, 12000);
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "Extraia contatos comerciais (nome, cargo, e-mail, telefone, whatsapp, site) de documentos de fornecedores de turismo. Use a função fornecida. Se não houver contato claro, retorne array vazio." },
        { role: "user", content: `Fornecedor: ${supplierName}\n\nDocumento:\n${sample}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "set_contacts",
          description: "Lista de contatos extraídos do documento.",
          parameters: {
            type: "object",
            properties: {
              contacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    role: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                    whatsapp: { type: "string" },
                  },
                  required: ["name"],
                },
              },
              website: { type: "string" },
            },
            required: ["contacts"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "set_contacts" } },
    }),
  });
  if (!resp.ok) throw new Error(`AI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return args ? JSON.parse(args) : { contacts: [] };
}

async function processDoc(supabase: any, apiKey: string, doc: any) {
  const fmt = (doc.file_format || "").toLowerCase();
  if (!["pdf", "docx"].includes(fmt)) {
    await supabase.from("supplier_documents").update({ contacts_extracted_at: new Date().toISOString() }).eq("id", doc.id);
    return { contacts: 0, skipped: "format" };
  }
  const { data: signed } = await supabase.storage.from("supplier-docs").createSignedUrl(doc.storage_path, 60);
  if (!signed?.signedUrl) throw new Error("no signed url");
  const r = await fetch(signed.signedUrl);
  const buf = await r.arrayBuffer();
  const text = await extractTextFromFile(buf, fmt);
  if (!text || text.length < 30) {
    await supabase.from("supplier_documents").update({ contacts_extracted_at: new Date().toISOString() }).eq("id", doc.id);
    return { contacts: 0, skipped: "no_text" };
  }
  const { data: sup } = await supabase.from("suppliers").select("id, name, email, phone, website").eq("id", doc.supplier_id).single();
  const result = await aiExtract(apiKey, text, sup.name);
  let inserted = 0;
  for (const c of (result.contacts || [])) {
    if (!c.name) continue;
    // dedup by email or phone
    const orParts: string[] = [];
    if (c.email) orParts.push(`email.eq.${c.email}`);
    if (c.phone) orParts.push(`phone.eq.${c.phone}`);
    let exists = false;
    if (orParts.length) {
      const { data: existing } = await supabase.from("supplier_contacts")
        .select("id").eq("supplier_id", doc.supplier_id).or(orParts.join(",")).limit(1);
      exists = !!(existing && existing.length);
    }
    if (exists) continue;
    const { error: insErr } = await supabase.from("supplier_contacts").insert({
      supplier_id: doc.supplier_id,
      name: c.name, role: c.role || null,
      email: c.email || null, phone: c.phone || null, whatsapp: c.whatsapp || null,
      is_primary: inserted === 0,
    });
    if (!insErr) inserted++;
  }
  // Patch supplier with first contact details if empty
  if (result.contacts?.length) {
    const c = result.contacts[0];
    const patch: any = {};
    if (!sup.email && c.email) patch.email = c.email;
    if (!sup.phone && c.phone) patch.phone = c.phone;
    if (!sup.website && result.website) patch.website = result.website;
    if (Object.keys(patch).length) await supabase.from("suppliers").update(patch).eq("id", sup.id);
  }
  await supabase.from("supplier_documents").update({ contacts_extracted_at: new Date().toISOString() }).eq("id", doc.id);
  return { contacts: inserted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { supplier_id, document_id, all } = await req.json().catch(() => ({}));
    let q = supabase.from("supplier_documents").select("*").is("contacts_extracted_at", null).in("file_format", ["pdf", "docx"]);
    if (document_id) q = supabase.from("supplier_documents").select("*").eq("id", document_id);
    else if (supplier_id) q = q.eq("supplier_id", supplier_id);
    else if (!all) throw new Error("supplier_id, document_id or all required");
    const { data: docs, error } = await q;
    if (error) throw error;
    const results: any[] = [];
    for (const doc of (docs || [])) {
      try {
        const r = await processDoc(supabase, LOVABLE_API_KEY, doc);
        results.push({ document_id: doc.id, ...r });
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
