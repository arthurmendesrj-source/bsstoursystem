// Transcribe spoken proposal items (audio) into structured hotel/service rows
// using Lovable AI (Gemini 2.5 Pro) with tool-calling.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOL = {
  type: "function",
  function: {
    name: "extract_proposal_items",
    description:
      "Extract proposal line items (hotels and services) from a travel agent's voice dictation.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["hotel", "service"] },
              description: { type: "string" },
              city: { type: "string" },
              check_in: { type: "string", description: "YYYY-MM-DD (hotels)" },
              check_out: { type: "string", description: "YYYY-MM-DD (hotels)" },
              item_date: { type: "string", description: "YYYY-MM-DD (services)" },
              quantity: { type: "number", description: "Pax × ways for services; rooms for hotels" },
              unit_cost: { type: "number" },
              markup_pct: { type: "number" },
            },
            required: ["kind", "description"],
          },
        },
      },
      required: ["items"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { audio_base64, mime_type, default_markup_pct } = await req.json();
    if (!audio_base64) {
      return new Response(JSON.stringify({ error: "audio_base64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "You are a travel-agent assistant. Listen to the audio (it can be in Portuguese, English, Spanish or Russian) and extract the proposal items the agent dictated. Use kind='hotel' for accommodation and kind='service' for tours/transfers/flights/etc. Dates must be ISO YYYY-MM-DD. If the agent gives only a season or month, leave dates empty. unit_cost is per night per room (hotel) or per pax/way (service). Always call the tool 'extract_proposal_items'. If nothing usable is heard, return items: [].",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract proposal items from this dictation:" },
              {
                type: "input_audio",
                input_audio: {
                  data: audio_base64,
                  format: mime_type?.includes("mp3") ? "mp3" : "webm",
                },
              },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_proposal_items" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("AI error", aiRes.status, text);
      return new Response(JSON.stringify({ error: "ai_error", detail: text }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    let items: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        items = Array.isArray(parsed.items) ? parsed.items : [];
      } catch (e) {
        console.error("parse tool args failed", e);
      }
    }

    const dm = Number(default_markup_pct) || 0;
    items = items.map((it) => ({
      kind: it.kind === "hotel" ? "hotel" : "service",
      description: String(it.description ?? "").trim(),
      city: it.city ?? null,
      check_in: it.check_in ?? null,
      check_out: it.check_out ?? null,
      item_date: it.item_date ?? null,
      quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
      unit_cost: Number(it.unit_cost) || 0,
      markup_pct: it.markup_pct != null ? Number(it.markup_pct) : dm,
    }));

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
