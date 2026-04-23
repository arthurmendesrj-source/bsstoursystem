import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    "Content-Type": "application/json",
  };
}

async function gw(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`Gmail API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any;
}

function decodeB64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  // pad
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

function findHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractBody(part: GmailPart | undefined): { html: string; text: string; hasAttachments: boolean } {
  let html = "";
  let text = "";
  let hasAttachments = false;
  function walk(p?: GmailPart) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) hasAttachments = true;
    if (p.mimeType === "text/html" && p.body?.data) html += decodeB64Url(p.body.data);
    else if (p.mimeType === "text/plain" && p.body?.data) text += decodeB64Url(p.body.data);
    p.parts?.forEach(walk);
  }
  walk(part);
  return { html, text, hasAttachments };
}

function parseFrom(value: string | undefined): { name: string; email: string } {
  if (!value) return { name: "", email: "" };
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: value.trim() };
}

// ---------------- list ----------------
export const gmailList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { q?: string; maxResults?: number; pageToken?: string }) => data)
  .handler(async ({ data }) => {
    const params = new URLSearchParams();
    params.set("maxResults", String(data.maxResults ?? 50));
    if (data.q) params.set("q", data.q);
    if (data.pageToken) params.set("pageToken", data.pageToken);
    const res = await gw(`/users/me/messages?${params.toString()}`);
    return res as { messages?: { id: string; threadId: string }[]; nextPageToken?: string };
  });

// ---------------- get full message ----------------
export const gmailGet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const res = await gw(`/users/me/messages/${encodeURIComponent(data.id)}?format=full`);
    const payload = (res as { payload?: GmailPart }).payload;
    const headers = payload?.headers;
    const from = parseFrom(findHeader(headers, "From"));
    const to = (findHeader(headers, "To") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const subject = findHeader(headers, "Subject") ?? "";
    const date = findHeader(headers, "Date");
    const messageIdHeader = findHeader(headers, "Message-ID") ?? findHeader(headers, "Message-Id");
    const references = findHeader(headers, "References");
    const { html, text, hasAttachments } = extractBody(payload);
    return {
      id: (res as { id: string }).id,
      threadId: (res as { threadId: string }).threadId,
      labelIds: (res as { labelIds?: string[] }).labelIds ?? [],
      snippet: (res as { snippet?: string }).snippet ?? "",
      from,
      to,
      subject,
      date,
      messageIdHeader,
      references,
      bodyHtml: html,
      bodyText: text,
      hasAttachments,
    };
  });

// ---------------- modify (read/unread/archive/trash) ----------------
export const gmailModify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; addLabelIds?: string[]; removeLabelIds?: string[]; trash?: boolean; untrash?: boolean }) => data)
  .handler(async ({ data }) => {
    if (data.trash) {
      return await gw(`/users/me/messages/${encodeURIComponent(data.id)}/trash`, { method: "POST" });
    }
    if (data.untrash) {
      return await gw(`/users/me/messages/${encodeURIComponent(data.id)}/untrash`, { method: "POST" });
    }
    return await gw(`/users/me/messages/${encodeURIComponent(data.id)}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds: data.addLabelIds ?? [], removeLabelIds: data.removeLabelIds ?? [] }),
    });
  });

// ---------------- send / reply ----------------
function toBase64Url(input: string) {
  // utf-8 safe
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRfc2822({
  to, subject, body, inReplyTo, references, cc,
}: { to: string; subject: string; body: string; inReplyTo?: string; references?: string; cc?: string }) {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : "",
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    references ? `References: ${references}` : "",
    "",
    body,
  ].filter(Boolean);
  return lines.join("\r\n");
}

export const gmailSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string; references?: string; cc?: string }) => data)
  .handler(async ({ data }) => {
    const raw = toBase64Url(buildRfc2822(data));
    const body: Record<string, unknown> = { raw };
    if (data.threadId) body.threadId = data.threadId;
    return await gw(`/users/me/messages/send`, { method: "POST", body: JSON.stringify(body) });
  });

// ---------------- sync to db ----------------
export const gmailSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { q?: string; maxResults?: number }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const params = new URLSearchParams();
    params.set("maxResults", String(data.maxResults ?? 50));
    params.set("q", data.q ?? "in:inbox");
    const list = (await gw(`/users/me/messages?${params.toString()}`)) as { messages?: { id: string }[] };
    const ids = (list.messages ?? []).map((m) => m.id);

    // Fetch metadata for each (in parallel, modest concurrency)
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const m = (await gw(
          `/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        )) as { id: string; threadId: string; labelIds?: string[]; snippet?: string; payload?: { headers?: GmailHeader[] }; internalDate?: string };
        const headers = m.payload?.headers;
        const from = parseFrom(findHeader(headers, "From"));
        const to = (findHeader(headers, "To") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const subject = findHeader(headers, "Subject") ?? "";
        const dateHeader = findHeader(headers, "Date");
        const received = m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString());
        return {
          gmail_id: m.id,
          thread_id: m.threadId,
          from_email: from.email,
          from_name: from.name,
          to_emails: to,
          subject,
          snippet: m.snippet ?? "",
          received_at: received,
          labels: m.labelIds ?? [],
          is_unread: (m.labelIds ?? []).includes("UNREAD"),
        };
      } catch (e) {
        console.error("sync metadata error", id, e);
        return null;
      }
    }));

    const rows = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) {
      const { error } = await supabase.from("emails").upsert(rows, { onConflict: "gmail_id" });
      if (error) throw new Error(`db upsert: ${error.message}`);
    }
    return { synced: rows.length };
  });

// ---------------- analyze with AI (returns suggestion only) ----------------
export const emailAnalyze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { gmail_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ensure body
    const full = (await gw(`/users/me/messages/${encodeURIComponent(data.gmail_id)}?format=full`)) as {
      id: string; threadId: string; snippet?: string; payload?: GmailPart; labelIds?: string[];
    };
    const headers = full.payload?.headers;
    const from = parseFrom(findHeader(headers, "From"));
    const subject = findHeader(headers, "Subject") ?? "";
    const { html, text } = extractBody(full.payload);
    const bodyForAi = (text || html.replace(/<[^>]+>/g, " ")).slice(0, 8000);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de uma operadora de turismo. Analise o e-mail recebido e extraia dados estruturados para criar um lead de viagem. Use null quando não houver informação. Responda sempre via tool call.",
          },
          {
            role: "user",
            content: `De: ${from.name} <${from.email}>\nAssunto: ${subject}\n\n${bodyForAi}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_lead",
              description: "Extrai dados estruturados do e-mail para criar um lead.",
              parameters: {
                type: "object",
                properties: {
                  is_lead: { type: "boolean", description: "true se o e-mail representa interesse de viagem; false para spam/newsletters/conversa interna." },
                  intent: { type: "string", enum: ["cotacao", "duvida", "reclamacao", "outro"] },
                  customer_name: { type: ["string", "null"] },
                  customer_email: { type: ["string", "null"] },
                  customer_phone: { type: ["string", "null"] },
                  destination: { type: ["string", "null"] },
                  expected_travel_date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD" },
                  pax: { type: ["integer", "null"] },
                  estimated_value: { type: ["number", "null"] },
                  currency: { type: ["string", "null"], enum: ["BRL", "USD", "EUR", null] },
                  notes: { type: ["string", "null"], description: "Resumo curto do pedido." },
                  next_action: { type: ["string", "null"] },
                },
                required: ["is_lead", "intent"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_lead" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (aiRes.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage.");
      throw new Error(`AI gateway ${aiRes.status}: ${errText}`);
    }
    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let suggestion: any = {};
    try {
      suggestion = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
    } catch {
      suggestion = {};
    }

    // Cache suggestion in db (best effort)
    await supabase.from("emails").update({ ai_suggestion: suggestion }).eq("gmail_id", data.gmail_id);

    return { suggestion, from, subject } as { suggestion: { [k: string]: unknown }; from: { name: string; email: string }; subject: string };
  });
