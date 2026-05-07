// Assistente IA: monta programa turístico estruturado a partir do contexto do lead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

const PROGRAM_TOOL = {
  type: "function",
  function: {
    name: "update_program",
    description:
      "Devolve o Programa Turístico estruturado (cronograma, hotéis, voos, serviços) e uma mensagem para o operador.",
    parameters: {
      type: "object",
      properties: {
        assistant_message: {
          type: "string",
          description: "Resposta em texto para o operador (markdown, PT-BR por padrão).",
        },
        program: {
          type: "object",
          properties: {
            summary: { type: "string" },
            language: { type: "string" },
            days: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "number" },
                  date: { type: "string", description: "ISO YYYY-MM-DD — obrigatório, sequência a partir do início da viagem." },
                  city: { type: "string" },
                  morning: { type: "string" },
                  afternoon: { type: "string" },
                  evening: { type: "string" },
                  schedule: {
                    type: "array",
                    description: "Cronograma horário do dia.",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "string", description: "HH:MM 24h" },
                        title: { type: "string" },
                        description: { type: "string" },
                        kind: { type: "string", enum: ["transfer", "tour", "meal", "free", "hotel", "flight"] },
                      },
                      required: ["time", "title"],
                    },
                  },
                },
                required: ["day", "date", "city"],
              },
            },
            hotels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  city: { type: "string" },
                  name: { type: "string" },
                  category: { type: "string" },
                  nights: { type: "number" },
                  rooms: { type: "number" },
                  check_in: { type: "string", description: "YYYY-MM-DD" },
                  check_out: { type: "string", description: "YYYY-MM-DD" },
                  check_in_time: { type: "string", description: "HH:MM, default 15:00" },
                  check_out_time: { type: "string", description: "HH:MM, default 11:00" },
                  notes: { type: "string" },
                },
                required: ["city", "nights", "check_in", "check_out"],
              },
            },
            flights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  date: { type: "string", description: "YYYY-MM-DD" },
                  departure_time: { type: "string", description: "HH:MM" },
                  arrival_time: { type: "string", description: "HH:MM" },
                  class: { type: "string" },
                  pax: { type: "number" },
                  notes: { type: "string" },
                },
                required: ["from", "to", "date"],
              },
            },
            services: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "number" },
                  date: { type: "string", description: "YYYY-MM-DD" },
                  start_time: { type: "string", description: "HH:MM" },
                  end_time: { type: "string", description: "HH:MM" },
                  city: { type: "string" },
                  kind: { type: "string", enum: ["tour", "transfer", "service"] },
                  description: { type: "string" },
                  pax: { type: "number" },
                  duration: { type: "string" },
                },
                required: ["kind", "description", "date"],
              },
            },
            notes: { type: "string" },
          },
          required: ["summary", "days"],
        },
      },
      required: ["assistant_message", "program"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      lead_id,
      quote_id,
      messages = [],
      options = {},
    }: {
      lead_id: string;
      quote_id?: string;
      messages: ChatMsg[];
      options: {
        include_emails?: boolean;
        include_interactions?: boolean;
        include_rag?: boolean;
        language?: string;
        tone?: string;
      };
    } = body;

    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Carregar contexto
    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [interactionsRes, emailsRes, quoteRes] = await Promise.all([
      options.include_interactions !== false
        ? supabase
            .from("interactions")
            .select("type, subject, content, occurred_at")
            .eq("lead_id", lead_id)
            .order("occurred_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as any[] }),
      options.include_emails !== false
        ? supabase
            .from("emails")
            .select("from_email, subject, snippet, body_text, received_at")
            .eq("lead_id", lead_id)
            .order("received_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] as any[] }),
      quote_id
        ? supabase
            .from("quote_items")
            .select("kind, description, quantity, city, category, item_date, check_out, nights, rooms, pax, notes")
            .eq("quote_id", quote_id)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const interactions = interactionsRes.data ?? [];
    const emails = emailsRes.data ?? [];
    const currentItems = quoteRes.data ?? [];

    const language = options.language || "pt-BR";
    const tone = options.tone || "inspiracional";

    const contextBlock = `
LEAD:
- Nome: ${lead.name}
- Email: ${lead.email ?? "—"}  Telefone: ${lead.phone ?? "—"}
- Destino: ${lead.destination ?? "—"}
- Data prevista de viagem: ${lead.expected_travel_date ?? "—"}
- Orçamento estimado: ${lead.estimated_value ?? "—"} ${lead.currency ?? ""}
- Notas: ${lead.notes ?? "—"}

ÚLTIMAS INTERAÇÕES (${interactions.length}):
${interactions
  .map((i: any) => `- [${i.type}] ${i.subject ?? ""} — ${(i.content ?? "").slice(0, 280)}`)
  .join("\n") || "— nenhuma —"}

E-MAILS RECENTES (${emails.length}):
${emails
  .map(
    (e: any) =>
      `- de ${e.from_email}: ${e.subject ?? ""}\n  ${(e.body_text ?? e.snippet ?? "").slice(0, 400)}`,
  )
  .join("\n") || "— nenhum —"}

ITENS JÁ NA COTAÇÃO (${currentItems.length}):
${currentItems
  .map(
    (it: any) =>
      `- ${it.kind}: ${it.description} (qtd ${it.quantity}, ${it.city ?? ""} ${it.item_date ?? ""})`,
  )
  .join("\n") || "— vazio —"}
`.trim();

    const systemPrompt = `Você é um Arquiteto de Roteiros sênior em turismo de luxo, atuando como assistente do operador.
Sua tarefa: a partir do contexto do lead (perfil, e-mails, interações), montar um Programa Turístico COMPLETO e refiná-lo conforme o operador pedir alterações.

Regras:
- Idioma da resposta: ${language}. Tom: ${tone}.
- Sempre responda chamando a tool "update_program" com a versão ATUAL e COMPLETA do programa (não envie deltas).
- O cronograma "days" deve cobrir todos os dias da viagem (manhã/tarde/noite).
- Hotéis: liste UMA entrada por cidade/trecho com noites e categoria estimada.
- Voos: inclua trechos plausíveis (ida, internos, volta) baseados no destino.
- Serviços: tours, passeios, traslados, ingressos — vinculados ao dia.
- Em "assistant_message" explique brevemente as escolhas e pergunte se o operador deseja ajustar algo.
- Se faltar informação crítica (datas, pax), use suposições razoáveis e marque em "notes".

CONTEXTO ATUAL:
${contextBlock}`;

    const chatMessages: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Se for primeira chamada (sem mensagens do user), instrua a gerar a primeira proposta.
    if (messages.length === 0) {
      chatMessages.push({
        role: "user",
        content:
          "Monte a primeira versão do Programa Turístico para este lead com base em todo o contexto acima.",
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: chatMessages,
        tools: [PROGRAM_TOOL],
        tool_choice: { type: "function", function: { name: "update_program" } },
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      return new Response(
        JSON.stringify({
          error:
            aiResp.status === 429
              ? "Rate limit — tente novamente em instantes."
              : aiResp.status === 402
                ? "Créditos de IA esgotados."
                : `AI error: ${text}`,
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json: any = await aiResp.json();
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Resposta sem programa estruturado." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({
        assistant_message: parsed.assistant_message,
        program: parsed.program,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
