import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type EmailAiResult = {
  summary: string;
  language: string;
  sentiment: "positivo" | "neutro" | "negativo";
  priority: "alta" | "normal" | "baixa";
  category: "lead_novo" | "cliente_existente" | "fornecedor" | "suporte" | "spam" | "outros";
  suggestion: {
    kind: "lead" | "activity" | "none";
    title: string;
    fields: {
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      destination?: string;
      travel_dates?: string;
      pax?: string;
      budget?: string;
      notes?: string;
    };
  };
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrompt(email: { from: string; subject: string; body: string }) {
  return `Você é um assistente de uma agência de turismo. Analise o email abaixo e retorne SOMENTE um JSON válido seguindo exatamente o schema indicado. Sem texto fora do JSON.

EMAIL:
De: ${email.from}
Assunto: ${email.subject}
Corpo:
${email.body.slice(0, 6000)}

SCHEMA (retorne exatamente esses campos):
{
  "summary": "resumo em 2 a 4 linhas, em português",
  "language": "código ISO (pt, en, es, ...)",
  "sentiment": "positivo | neutro | negativo",
  "priority": "alta | normal | baixa",
  "category": "lead_novo | cliente_existente | fornecedor | suporte | spam | outros",
  "suggestion": {
    "kind": "lead | activity | none",
    "title": "título curto sugerido para a ação",
    "fields": {
      "contact_name": "...",
      "contact_email": "...",
      "contact_phone": "...",
      "destination": "...",
      "travel_dates": "...",
      "pax": "...",
      "budget": "...",
      "notes": "..."
    }
  }
}

Regras:
- Se o email parecer um pedido de cotação/viagem novo => kind = "lead".
- Se for follow-up de cliente já existente, dúvida ou tarefa operacional => kind = "activity".
- Se for spam, marketing ou irrelevante => kind = "none" e category = "spam" ou "outros".
- Preencha apenas os campos do "fields" que conseguir extrair com confiança; deixe ausentes os que não souber.`;
}

async function callGateway(prompt: string): Promise<EmailAiResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Você responde APENAS com JSON válido." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (resp.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
  if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage.");
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Falha na IA: ${resp.status} ${text.slice(0, 200)}`);
  }

  const json: any = await resp.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  }

  return {
    summary: String(parsed.summary ?? "").slice(0, 1200),
    language: String(parsed.language ?? "pt"),
    sentiment: (["positivo", "neutro", "negativo"].includes(parsed.sentiment) ? parsed.sentiment : "neutro") as EmailAiResult["sentiment"],
    priority: (["alta", "normal", "baixa"].includes(parsed.priority) ? parsed.priority : "normal") as EmailAiResult["priority"],
    category: (["lead_novo", "cliente_existente", "fornecedor", "suporte", "spam", "outros"].includes(parsed.category) ? parsed.category : "outros") as EmailAiResult["category"],
    suggestion: {
      kind: (["lead", "activity", "none"].includes(parsed?.suggestion?.kind) ? parsed.suggestion.kind : "none") as EmailAiResult["suggestion"]["kind"],
      title: String(parsed?.suggestion?.title ?? "").slice(0, 200),
      fields: {
        contact_name: parsed?.suggestion?.fields?.contact_name ? String(parsed.suggestion.fields.contact_name) : undefined,
        contact_email: parsed?.suggestion?.fields?.contact_email ? String(parsed.suggestion.fields.contact_email) : undefined,
        contact_phone: parsed?.suggestion?.fields?.contact_phone ? String(parsed.suggestion.fields.contact_phone) : undefined,
        destination: parsed?.suggestion?.fields?.destination ? String(parsed.suggestion.fields.destination) : undefined,
        travel_dates: parsed?.suggestion?.fields?.travel_dates ? String(parsed.suggestion.fields.travel_dates) : undefined,
        pax: parsed?.suggestion?.fields?.pax ? String(parsed.suggestion.fields.pax) : undefined,
        budget: parsed?.suggestion?.fields?.budget ? String(parsed.suggestion.fields.budget) : undefined,
        notes: parsed?.suggestion?.fields?.notes ? String(parsed.suggestion.fields.notes) : undefined,
      },
    },
  };
}

async function authorize(supabase: any, callerId: string, targetUserId: string): Promise<boolean> {
  if (callerId === targetUserId) return true;
  const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: callerId });
  if (isAdmin) return true;
  const { data: isSub } = await supabase.rpc("is_subordinate_of", { _user_id: targetUserId, _supervisor_id: callerId });
  return !!isSub;
}

export const analyzeEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; gmailId: string; force?: boolean }) =>
    z.object({
      targetUserId: z.string().uuid(),
      gmailId: z.string().min(1),
      force: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.force) {
      const { data: cached } = await supabaseAdmin
        .from("email_ai_cache")
        .select("payload")
        .eq("user_id", data.targetUserId)
        .eq("message_id", data.gmailId)
        .maybeSingle();
      if (cached?.payload) return { cached: true, result: cached.payload as EmailAiResult };
    }

    const { fetchMessage } = await import("./gmail-api.server");
    const msg = await fetchMessage(data.targetUserId, data.gmailId);
    if (!msg) throw new Error("Mensagem não encontrada no Gmail.");

    const body = msg.text?.trim() || (msg.html ? stripHtml(msg.html) : "");
    const prompt = buildPrompt({ from: msg.from || "", subject: msg.subject || "", body });
    const result = await callGateway(prompt);

    await supabaseAdmin.from("email_ai_cache").upsert({
      user_id: data.targetUserId,
      message_id: data.gmailId,
      payload: result as any,
      created_at: new Date().toISOString(),
    });

    return { cached: false, result };
  });

export const triageInboxFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; gmailIds: string[] }) =>
    z.object({
      targetUserId: z.string().uuid(),
      gmailIds: z.array(z.string().min(1)).min(1).max(30),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchMessage } = await import("./gmail-api.server");

    const { data: cachedRows } = await supabaseAdmin
      .from("email_ai_cache")
      .select("message_id,payload")
      .eq("user_id", data.targetUserId)
      .in("message_id", data.gmailIds);
    const cacheMap = new Map<string, EmailAiResult>(
      (cachedRows ?? []).map((r: any) => [r.message_id as string, r.payload as EmailAiResult]),
    );

    const out: Array<{ gmailId: string; result?: EmailAiResult; error?: string; cached: boolean }> = [];

    for (const gmailId of data.gmailIds) {
      const cached = cacheMap.get(gmailId);
      if (cached) {
        out.push({ gmailId, result: cached, cached: true });
        continue;
      }
      try {
        const msg = await fetchMessage(data.targetUserId, gmailId);
        if (!msg) {
          out.push({ gmailId, error: "não encontrada", cached: false });
          continue;
        }
        const body = msg.text?.trim() || (msg.html ? stripHtml(msg.html) : "");
        const prompt = buildPrompt({ from: msg.from || "", subject: msg.subject || "", body });
        const result = await callGateway(prompt);
        await supabaseAdmin.from("email_ai_cache").upsert({
          user_id: data.targetUserId,
          message_id: gmailId,
          payload: result as any,
          created_at: new Date().toISOString(),
        });
        out.push({ gmailId, result, cached: false });
        await new Promise((r) => setTimeout(r, 350));
      } catch (e: any) {
        out.push({ gmailId, error: e?.message ?? "falha", cached: false });
        if (String(e?.message ?? "").toLowerCase().includes("limite")) break;
      }
    }

    return { results: out };
  });

export const getCachedAiResultsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; gmailIds: string[] }) =>
    z.object({
      targetUserId: z.string().uuid(),
      gmailIds: z.array(z.string().min(1)).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Error("Acesso negado");
    if (data.gmailIds.length === 0) return { results: {} as Record<string, EmailAiResult> };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("email_ai_cache")
      .select("message_id,payload")
      .eq("user_id", data.targetUserId)
      .in("message_id", data.gmailIds);

    const map: Record<string, EmailAiResult> = {};
    for (const r of rows ?? []) {
      map[(r as any).message_id as string] = (r as any).payload as EmailAiResult;
    }
    return { results: map };
  });
