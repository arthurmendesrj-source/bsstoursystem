// Process an uploaded itinerary file (.docx or .pdf):
// 1) download from storage
// 2) extract text
// 3) extract structured metadata via Lovable AI
// 4) chunk + embed (streamed in small batches to keep memory low)
// 5) update itineraries + insert itinerary_chunks
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mammoth from "https://esm.sh/mammoth@1.8.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "google/text-embedding-004";
const META_MODEL = "google/gemini-2.5-flash";

const MAX_TEXT_FOR_EXTRACTION = 600_000; // ~600 KB of text -> safety cap
const SAVED_TEXT_CHARS = 100_000;
const EMBED_BATCH = 8;
const INSERT_BATCH = 25;

function chunkText(text: string, maxChars = 2400, overlap = 200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + maxChars);
    out.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - overlap;
  }
  return out;
}

async function extractMetadata(apiKey: string, text: string) {
  const sample = text.slice(0, 12000);
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: META_MODEL,
      messages: [
        { role: "system", content: "Você analisa roteiros de viagem e extrai metadados estruturados. Responda chamando a função fornecida." },
        { role: "user", content: `Analise este roteiro e extraia os metadados:\n\n${sample}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_itinerary_metadata",
          description: "Extrai metadados estruturados do roteiro de viagem.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              destinations: { type: "array", items: { type: "string" } },
              duration_days: { type: "number" },
              language: { type: "string", enum: ["pt", "en", "es", "ru"] },
              trip_type: { type: "string", enum: ["lua_de_mel", "familia", "aventura", "luxo", "cultural", "corporativo", "grupo", "outro"] },
              price_range: { type: "string", enum: ["economico", "medio", "alto", "luxo"] },
              estimated_value: { type: "number" },
              currency: { type: "string", enum: ["BRL", "USD", "EUR"] },
              suppliers_mentioned: { type: "array", items: { type: "string" } },
              tags: { type: "array", items: { type: "string" } },
              year: { type: "number" },
              season: { type: "string" },
              summary: { type: "string" },
            },
            required: ["title", "destinations", "summary"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_itinerary_metadata" } },
    }),
  });
  if (!resp.ok) throw new Error(`metadata AI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("no tool call result");
  return JSON.parse(args);
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][] | null> {
  const resp = await fetch(EMBED_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (resp.status === 404) return null; // embeddings not available -> skip semantic indexing
  if (!resp.ok) throw new Error(`embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.data.map((d: any) => d.embedding);
}

async function extractTextFromFile(buf: ArrayBuffer, format: string): Promise<string> {
  if (format === "docx") {
    // mammoth on Deno expects a Node Buffer, not a raw ArrayBuffer
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return result.value || "";
  }
  if (format === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : (text as string);
  }
  throw new Error(`unsupported format: ${format}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let itineraryId: string | null = null;
  try {
    const body = await req.json();
    itineraryId = body.itinerary_id;
    if (!itineraryId) throw new Error("itinerary_id required");

    const { data: it, error: itErr } = await supabase
      .from("itineraries").select("*").eq("id", itineraryId).single();
    if (itErr || !it) throw new Error(itErr?.message || "not found");

    await supabase.from("itineraries")
      .update({ processing_status: "processing", processing_error: null })
      .eq("id", itineraryId);

    // 1. Download
    const { data: blob, error: dlErr } = await supabase.storage.from("itineraries").download(it.storage_path);
    if (dlErr || !blob) throw new Error(`download: ${dlErr?.message}`);
    let buf: ArrayBuffer | null = await blob.arrayBuffer();

    // 2. Extract text
    let text = await extractTextFromFile(buf!, it.file_format);
    buf = null; // release
    if (!text || text.length < 50) throw new Error("extracted text too short");
    if (text.length > MAX_TEXT_FOR_EXTRACTION) {
      text = text.slice(0, MAX_TEXT_FOR_EXTRACTION);
    }

    // 3. Metadata (uses only first 12k chars)
    const meta = await extractMetadata(LOVABLE_API_KEY, text);

    // 4+5. Chunk, embed and insert in small streamed batches to keep memory low
    await supabase.from("itinerary_chunks").delete().eq("itinerary_id", itineraryId);
    const chunks = chunkText(text);
    let pendingRows: Array<{ itinerary_id: string; chunk_index: number; content: string; embedding: any }> = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const embs = await embedBatch(LOVABLE_API_KEY, batch);
      for (let j = 0; j < batch.length; j++) {
        pendingRows.push({
          itinerary_id: itineraryId!,
          chunk_index: i + j,
          content: batch[j],
          embedding: embs[j] as any,
        });
      }
      if (pendingRows.length >= INSERT_BATCH) {
        const { error } = await supabase.from("itinerary_chunks").insert(pendingRows);
        if (error) throw new Error(`chunks: ${error.message}`);
        pendingRows = [];
      }
    }
    if (pendingRows.length > 0) {
      const { error } = await supabase.from("itinerary_chunks").insert(pendingRows);
      if (error) throw new Error(`chunks: ${error.message}`);
      pendingRows = [];
    }

    await supabase.from("itineraries").update({
      title: meta.title || it.title,
      destinations: meta.destinations || [],
      duration_days: meta.duration_days ?? null,
      language: meta.language || it.language,
      trip_type: meta.trip_type || null,
      price_range: meta.price_range || null,
      estimated_value: meta.estimated_value ?? null,
      currency: meta.currency || null,
      suppliers_mentioned: meta.suppliers_mentioned || [],
      tags: meta.tags || [],
      year: meta.year ?? null,
      season: meta.season || null,
      summary: meta.summary || null,
      extracted_text: text.slice(0, SAVED_TEXT_CHARS),
      processing_status: "ready",
    }).eq("id", itineraryId);

    return new Response(JSON.stringify({ ok: true, chunks: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (/memory limit/i.test(msg)) {
      msg = "Documento muito grande para processar — tente dividir o arquivo em partes menores.";
    }
    console.error("process-itinerary error:", msg);
    if (itineraryId) {
      await supabase.from("itineraries").update({ processing_status: "failed", processing_error: msg }).eq("id", itineraryId);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
