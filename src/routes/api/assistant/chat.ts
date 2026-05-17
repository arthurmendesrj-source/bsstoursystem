import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { ASSISTANT_SYSTEM_PROMPT } from "@/server/assistant.prompt";
import { ASSISTANT_TOOLS, executeReadTool } from "@/server/assistant.tools";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveUserTenantId } from "@/server/tenant.server";
import { tenantPath } from "@/lib/tenantStorage";
import type { Database } from "@/integrations/supabase/types";

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

const PROPOSE_TOOLS = new Set([
  "propose_create_lead",
  "propose_update_lead",
  "propose_create_interaction",
  "propose_create_activity",
]);

async function authenticate(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { supabase, userId: data.claims.sub as string };
}

async function webSearch(query: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return "Busca web indisponível.";
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um pesquisador. Busque na web e responda em português com fatos atualizados, citando as fontes (URLs)." },
          { role: "user", content: query },
        ],
      }),
    });
    if (!r.ok) return `Erro na busca: ${r.status}`;
    const j: any = await r.json();
    return j?.choices?.[0]?.message?.content ?? "Sem resultados.";
  } catch (e: any) {
    return `Erro: ${e.message}`;
  }
}

async function generateImageTool(prompt: string, userId: string, conversationId: string, tenantId: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) throw new Error(`Falha image gen: ${r.status}`);
  const j: any = await r.json();
  const dataUrl: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) throw new Error("Sem imagem na resposta");
  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = tenantPath(tenantId, userId, `${Date.now()}.png`);
  await supabaseAdmin.storage.from("ai-images").upload(path, bytes, { contentType: "image/png" });
  await supabaseAdmin.from("ai_generated_images").insert({
    user_id: userId,
    conversation_id: conversationId,
    prompt,
    storage_path: path,
  });
  const { data: signed } = await supabaseAdmin.storage.from("ai-images").createSignedUrl(path, 60 * 60 * 24 * 7);
  return signed?.signedUrl ?? "";
}

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await authenticate(request);
        if (!authed) return new Response("Unauthorized", { status: 401 });
        const { supabase, userId } = authed;

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const conversationId: string = body.conversationId;
        const userMessage: string = body.message;
        if (!conversationId || !userMessage) return new Response("missing fields", { status: 400 });

        // Verify conversation belongs to user
        const { data: conv } = await supabase
          .from("ai_conversations")
          .select("id, model")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv) return new Response("conversation not found", { status: 404 });
        const model = conv.model || "google/gemini-2.5-flash";

        // Persist user message
        await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: userMessage,
        });

        // Load history
        const { data: history } = await supabase
          .from("ai_messages")
          .select("role, content, tool_calls, tool_call_id, name")
          .eq("conversation_id", conversationId)
          .order("created_at");

        const messages: ChatMsg[] = [
          { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
          ...(history ?? []).map((m: any) => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls ?? undefined,
            tool_call_id: m.tool_call_id ?? undefined,
            name: m.name ?? undefined,
          })),
        ];

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: any) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

            try {
              for (let round = 0; round < 6; round++) {
                const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model,
                    messages,
                    tools: ASSISTANT_TOOLS,
                    stream: true,
                  }),
                });
                if (resp.status === 429) {
                  send({ type: "error", message: "Limite de requisições atingido. Aguarde um momento." });
                  break;
                }
                if (resp.status === 402) {
                  send({ type: "error", message: "Créditos do Lovable AI esgotados. Adicione fundos no workspace." });
                  break;
                }
                if (!resp.ok || !resp.body) {
                  const t = await resp.text();
                  send({ type: "error", message: `Erro IA: ${resp.status} ${t.slice(0, 200)}` });
                  break;
                }

                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let assistantText = "";
                const toolCallsAcc: Record<number, any> = {};
                let finishReason: string | null = null;

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  let nl: number;
                  while ((nl = buffer.indexOf("\n")) !== -1) {
                    let line = buffer.slice(0, nl);
                    buffer = buffer.slice(nl + 1);
                    if (line.endsWith("\r")) line = line.slice(0, -1);
                    if (!line.startsWith("data: ")) continue;
                    const json = line.slice(6).trim();
                    if (json === "[DONE]") continue;
                    try {
                      const parsed = JSON.parse(json);
                      const choice = parsed.choices?.[0];
                      const delta = choice?.delta;
                      if (delta?.content) {
                        assistantText += delta.content;
                        send({ type: "delta", content: delta.content });
                      }
                      if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                          const idx = tc.index ?? 0;
                          if (!toolCallsAcc[idx]) {
                            toolCallsAcc[idx] = { id: tc.id, type: "function", function: { name: "", arguments: "" } };
                          }
                          if (tc.id) toolCallsAcc[idx].id = tc.id;
                          if (tc.function?.name) toolCallsAcc[idx].function.name += tc.function.name;
                          if (tc.function?.arguments) toolCallsAcc[idx].function.arguments += tc.function.arguments;
                        }
                      }
                      if (choice?.finish_reason) finishReason = choice.finish_reason;
                    } catch {
                      buffer = line + "\n" + buffer;
                      break;
                    }
                  }
                }

                const toolCalls = Object.values(toolCallsAcc);
                // Save assistant message
                const { data: assistantMsg } = await supabase
                  .from("ai_messages")
                  .insert({
                    conversation_id: conversationId,
                    role: "assistant",
                    content: assistantText || null,
                    tool_calls: toolCalls.length ? toolCalls : null,
                  })
                  .select()
                  .single();

                messages.push({
                  role: "assistant",
                  content: assistantText || null,
                  tool_calls: toolCalls.length ? toolCalls : undefined,
                });

                if (finishReason !== "tool_calls" || toolCalls.length === 0) {
                  break;
                }

                // Execute tools
                for (const tc of toolCalls) {
                  const name = tc.function.name;
                  let args: any = {};
                  try {
                    args = JSON.parse(tc.function.arguments || "{}");
                  } catch {}

                  let result: any;
                  try {
                    if (name === "web_search") {
                      result = { result: await webSearch(args.query || "") };
                    } else if (name === "generate_image") {
                      const url = await generateImageTool(args.prompt, userId, conversationId);
                      result = { url, note: "Imagem gerada e salva. Mostre ao usuário usando markdown: ![imagem](url)" };
                      send({ type: "image", url, prompt: args.prompt });
                    } else if (PROPOSE_TOOLS.has(name)) {
                      const { data: pending, error: insErr } = await supabase
                        .from("ai_pending_actions")
                        .insert({
                          conversation_id: conversationId,
                          message_id: assistantMsg?.id ?? null,
                          user_id: userId,
                          action_type: name,
                          payload: args,
                          status: "pending",
                        })
                        .select()
                        .single();
                      if (insErr) throw insErr;
                      result = {
                        pending_action_id: pending.id,
                        status: "pending_approval",
                        message: "Ação registrada e aguardando aprovação manual do operador no painel.",
                      };
                      send({ type: "pending_action", action: pending });
                    } else {
                      result = await executeReadTool(name, args, { supabase, userId });
                    }
                  } catch (err: any) {
                    result = { error: String(err?.message ?? err) };
                  }

                  const resultStr = JSON.stringify(result).slice(0, 8000);
                  await supabase.from("ai_messages").insert({
                    conversation_id: conversationId,
                    role: "tool",
                    content: resultStr,
                    tool_call_id: tc.id,
                    name,
                  });
                  messages.push({
                    role: "tool",
                    content: resultStr,
                    tool_call_id: tc.id,
                    name,
                  });
                  send({ type: "tool_result", name, tool_call_id: tc.id });
                }
              }

              await supabase
                .from("ai_conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conversationId);

              send({ type: "done" });
              controller.close();
            } catch (err: any) {
              try {
                send({ type: "error", message: String(err?.message ?? err) });
              } catch {}
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
