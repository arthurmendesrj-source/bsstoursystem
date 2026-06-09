import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGmailAccount } from "@/server/gmail-auth-middleware";
import { gmailFetch } from "@/server/gmail-auth.server";

async function gw(path: string, init?: RequestInit) {
  return gmailFetch(path, init);
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
  .inputValidator((data: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string; references?: string; cc?: string }) => data)
  .handler(async ({ data, context }) => {
    // Enforce: replies/forwards must come from the same Gmail account that owns the thread.
    if (data.threadId) {
      const { supabase } = context as { supabase: import("@supabase/supabase-js").SupabaseClient };
      const { data: row } = await supabase
        .from("emails")
        .select("owner_email")
        .eq("thread_id", data.threadId)
        .not("owner_email", "is", null)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const owner = (row as { owner_email: string | null } | null)?.owner_email?.toLowerCase() ?? null;
      const acct = (context as { gmailAccount?: { emailAddress: string } }).gmailAccount?.emailAddress?.toLowerCase();
      if (owner && acct && owner !== acct) {
        throw new Error(`Apenas o dono da caixa ${owner} pode responder esta conversa.`);
      }
    }
    const raw = toBase64Url(buildRfc2822(data));
    const body: Record<string, unknown> = { raw };
    if (data.threadId) body.threadId = data.threadId;
    return await gw(`/users/me/messages/send`, { method: "POST", body: JSON.stringify(body) });
  });

// ---------------- sync to db ----------------
export const gmailSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
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

// ---------------- analyze a local (db-only / seed) email with AI ----------------
export const emailAnalyzeLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { data: row, error } = await supabase
      .from("emails")
      .select("id, gmail_id, from_email, from_name, subject, snippet, body_text, body_html")
      .eq("id", data.email_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Email not found");

    const bodyForAi = ((row.body_text || (row.body_html ?? "").replace(/<[^>]+>/g, " ") || row.snippet || "") as string).slice(0, 8000);
    const subject = row.subject ?? "";
    const fromName = row.from_name ?? "";
    const fromEmail = row.from_email ?? "";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de uma operadora de turismo. Analise o e-mail recebido, gere um RESUMO curto em português (2-3 frases) e RECOMENDE uma ação ao operador: criar lead, criar atividade ou ignorar. Responda sempre via tool call.",
          },
          { role: "user", content: `De: ${fromName} <${fromEmail}>\nAssunto: ${subject}\n\n${bodyForAi}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_lead",
            description: "Resume o e-mail, recomenda uma ação e extrai dados para criar um lead.",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                suggested_action: { type: "string", enum: ["create_lead", "create_task", "ignore"] },
                suggested_task_category: { type: ["string", "null"], enum: ["negocio", "suporte", null] },
                suggested_task_priority: { type: ["string", "null"], enum: ["baixa", "media", "alta", null] },
                suggested_task_title: { type: ["string", "null"] },
                is_lead: { type: "boolean" },
                intent: { type: "string", enum: ["cotacao", "duvida", "reclamacao", "outro"] },
                customer_name: { type: ["string", "null"] },
                customer_email: { type: ["string", "null"] },
                customer_phone: { type: ["string", "null"] },
                destination: { type: ["string", "null"] },
                expected_travel_date: { type: ["string", "null"] },
                pax: { type: ["integer", "null"] },
                estimated_value: { type: ["number", "null"] },
                currency: { type: ["string", "null"], enum: ["BRL", "USD", "EUR", null] },
                notes: { type: ["string", "null"] },
                next_action: { type: ["string", "null"] },
              },
              required: ["summary", "suggested_action", "is_lead", "intent"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_lead" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (aiRes.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`AI gateway ${aiRes.status}: ${errText}`);
    }
    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let suggestion: any = {};
    try { suggestion = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {}; } catch { suggestion = {}; }

    await supabase.from("emails").update({ ai_suggestion: suggestion }).eq("id", row.id);

    return { suggestion: suggestion as { [k: string]: unknown & {} }, from: { name: fromName, email: fromEmail }, subject };
  });

// ---------------- analyze with AI (returns suggestion only) ----------------
export const emailAnalyze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
              "Você é um assistente de uma operadora de turismo. Analise o e-mail recebido, gere um RESUMO curto em português (2-3 frases) e RECOMENDE uma ação ao operador: criar lead (interesse comercial de viagem), criar atividade (suporte, dúvida operacional, follow-up sem novo negócio) ou ignorar (spam, newsletter, conversa interna). Quando houver dados de viagem, extraia-os para pré-preencher o lead. Use null quando não houver informação. Responda sempre via tool call.",
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
              description: "Resume o e-mail, recomenda uma ação e extrai dados para criar um lead.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Resumo curto (2-3 frases) em português do conteúdo do e-mail." },
                  suggested_action: { type: "string", enum: ["create_lead", "create_task", "ignore"], description: "Ação recomendada ao operador." },
                  suggested_task_category: { type: ["string", "null"], enum: ["negocio", "suporte", null], description: "Categoria sugerida quando a ação for create_task." },
                  suggested_task_priority: { type: ["string", "null"], enum: ["baixa", "media", "alta", null] },
                  suggested_task_title: { type: ["string", "null"], description: "Título curto sugerido para a atividade." },
                  is_lead: { type: "boolean", description: "true se o e-mail representa interesse de viagem." },
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
                required: ["summary", "suggested_action", "is_lead", "intent"],
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

    return { suggestion: suggestion as { [k: string]: unknown & {} }, from, subject };
  });

// ---------------- translate email body with AI ----------------
export const emailTranslate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
  .inputValidator((data: { gmail_id: string; target_language: string }) => data)
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const full = (await gw(`/users/me/messages/${encodeURIComponent(data.gmail_id)}?format=full`)) as {
      payload?: GmailPart;
    };
    const headers = full.payload?.headers;
    const subject = findHeader(headers, "Subject") ?? "";
    const { html, text } = extractBody(full.payload);
    const body = (text || html.replace(/<[^>]+>/g, " ")).slice(0, 12000);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um tradutor profissional. Traduza fielmente o assunto e o corpo do e-mail a seguir para ${data.target_language}, preservando formatação, quebras de linha e estrutura. Retorne APENAS o texto traduzido, no formato:\nAssunto: <assunto traduzido>\n\n<corpo traduzido>`,
          },
          { role: "user", content: `Assunto: ${subject}\n\n${body}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      if (aiRes.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`AI gateway ${aiRes.status}: ${errText}`);
    }
    const aiJson = await aiRes.json();
    const translated: string = aiJson?.choices?.[0]?.message?.content ?? "";
    return { translated };
  });
