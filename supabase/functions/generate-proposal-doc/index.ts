// Generate a commercial proposal .docx file using Lovable AI (Gemini) for narrative
// content + the `docx` library for layout. Uploads to private storage bucket
// `proposal-docs` and records in `quote_documents`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
} from "https://esm.sh/docx@8.5.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PriceMode = "final" | "detailed" | "category_table";
type Lang = "pt" | "en" | "es" | "ru";

const LABELS: Record<Lang, Record<string, string>> = {
  pt: {
    proposal: "Proposta Comercial",
    day: "Dia",
    city: "Cidade",
    description: "Descrição",
    date: "Data",
    qty: "Qtd",
    price: "Preço",
    subtotal: "Subtotal",
    total: "Total",
    includes: "O preço inclui",
    excludes: "O preço não inclui",
    notes: "Observações",
    itinerary: "Roteiro",
    services: "Serviços",
    pricing: "Valores",
    validUntil: "Válida até",
    schedule: "Cronograma",
    time: "Hora",
    activity: "Atividade",
    transfers: "Transfers",
    mealsIncluded: "Refeições incluídas",
    highlights: "Destaques",
    tips: "Dicas",
    practicalInfo: "Informações Práticas",
    bestTime: "Melhor época",
    weather: "Clima",
    currency: "Moeda",
    languageLabel: "Idioma",
    plugType: "Tomadas",
    tipping: "Gorjetas",
    documents: "Documentos",
    whatToPack: "O que levar",
    healthSafety: "Saúde & Segurança",
    emergencyContacts: "Contatos de Emergência",
    tripManagement: "Gestão da Viagem",
    arrivalInstructions: "Instruções de chegada",
    checkinPolicy: "Política de check-in / check-out",
    transfersOverview: "Transfers (visão geral)",
    guideLanguage: "Idioma do guia",
    support247: "Suporte 24/7",
    cancellationPolicy: "Política de cancelamento",
    paymentTerms: "Condições de pagamento",
  },
  en: {
    proposal: "Commercial Proposal",
    day: "Day",
    city: "City",
    description: "Description",
    date: "Date",
    qty: "Qty",
    price: "Price",
    subtotal: "Subtotal",
    total: "Total",
    includes: "The price includes",
    excludes: "The price does not include",
    notes: "Notes",
    itinerary: "Itinerary",
    services: "Services",
    pricing: "Pricing",
    validUntil: "Valid until",
    schedule: "Schedule",
    time: "Time",
    activity: "Activity",
    transfers: "Transfers",
    mealsIncluded: "Meals included",
    highlights: "Highlights",
    tips: "Tips",
    practicalInfo: "Practical Information",
    bestTime: "Best time to visit",
    weather: "Weather",
    currency: "Currency",
    languageLabel: "Language",
    plugType: "Plug type",
    tipping: "Tipping",
    documents: "Documents",
    whatToPack: "What to pack",
    healthSafety: "Health & Safety",
    emergencyContacts: "Emergency Contacts",
    tripManagement: "Trip Management",
    arrivalInstructions: "Arrival instructions",
    checkinPolicy: "Check-in / Check-out policy",
    transfersOverview: "Transfers overview",
    guideLanguage: "Guide language",
    support247: "24/7 Support",
    cancellationPolicy: "Cancellation policy",
    paymentTerms: "Payment terms",
  },
  es: {
    proposal: "Propuesta Comercial",
    day: "Día",
    city: "Ciudad",
    description: "Descripción",
    date: "Fecha",
    qty: "Cant.",
    price: "Precio",
    subtotal: "Subtotal",
    total: "Total",
    includes: "El precio incluye",
    excludes: "El precio no incluye",
    notes: "Notas",
    itinerary: "Itinerario",
    services: "Servicios",
    pricing: "Valores",
    validUntil: "Válida hasta",
    schedule: "Cronograma",
    time: "Hora",
    activity: "Actividad",
    transfers: "Traslados",
    mealsIncluded: "Comidas incluidas",
    highlights: "Destacados",
    tips: "Consejos",
    practicalInfo: "Información Práctica",
    bestTime: "Mejor época",
    weather: "Clima",
    currency: "Moneda",
    languageLabel: "Idioma",
    plugType: "Enchufes",
    tipping: "Propinas",
    documents: "Documentos",
    whatToPack: "Qué llevar",
    healthSafety: "Salud y Seguridad",
    emergencyContacts: "Contactos de Emergencia",
    tripManagement: "Gestión del Viaje",
    arrivalInstructions: "Instrucciones de llegada",
    checkinPolicy: "Política de check-in / check-out",
    transfersOverview: "Traslados (visión general)",
    guideLanguage: "Idioma del guía",
    support247: "Soporte 24/7",
    cancellationPolicy: "Política de cancelación",
    paymentTerms: "Condiciones de pago",
  },
  ru: {
    proposal: "Коммерческое предложение",
    day: "День",
    city: "Город",
    description: "Описание",
    date: "Дата",
    qty: "Кол-во",
    price: "Цена",
    subtotal: "Сумма",
    total: "Итого",
    includes: "В стоимость включено",
    excludes: "В стоимость не включено",
    notes: "Примечания",
    itinerary: "Программа",
    services: "Услуги",
    pricing: "Стоимость",
    validUntil: "Действительно до",
    schedule: "Расписание",
    time: "Время",
    activity: "Активность",
    transfers: "Трансферы",
    mealsIncluded: "Включённое питание",
    highlights: "Главное",
    tips: "Советы",
    practicalInfo: "Практическая информация",
    bestTime: "Лучшее время для поездки",
    weather: "Погода",
    currency: "Валюта",
    languageLabel: "Язык",
    plugType: "Розетки",
    tipping: "Чаевые",
    documents: "Документы",
    whatToPack: "Что взять с собой",
    healthSafety: "Здоровье и безопасность",
    emergencyContacts: "Экстренные контакты",
    tripManagement: "Управление поездкой",
    arrivalInstructions: "Инструкции по прибытию",
    checkinPolicy: "Политика заселения / выселения",
    transfersOverview: "Трансферы (обзор)",
    guideLanguage: "Язык гида",
    support247: "Поддержка 24/7",
    cancellationPolicy: "Политика отмены",
    paymentTerms: "Условия оплаты",
  },
};

const CONTENT_TOOL = {
  type: "function",
  function: {
    name: "build_proposal_content",
    description:
      "Generate full operational content for a commercial travel proposal: itinerary, logistics, practical info, and trip management.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        executive_summary: { type: "string", description: "Resumo executivo curto (2-4 frases) listando hotéis, voos e principais experiências vendidas." },
        intro: { type: "string", description: "Welcome paragraph (2-4 sentences)." },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day_number: { type: "number" },
              date: { type: "string" },
              city: { type: "string" },
              title: { type: "string" },
              narrative: { type: "string", description: "Rich descriptive paragraph for the day." },
              schedule: {
                type: "array",
                description: "Hour-by-hour planned activities for the day.",
                items: {
                  type: "object",
                  properties: {
                    time: { type: "string", description: "e.g., 09:00" },
                    activity: { type: "string" },
                  },
                  required: ["time", "activity"],
                },
              },
              transfers: {
                type: "array",
                description: "Logistical transfers, e.g. 'Airport GIG → Hotel Copacabana, ~45min'.",
                items: { type: "string" },
              },
              meals_included: {
                type: "array",
                description: "Meals included on the day (breakfast/lunch/dinner).",
                items: { type: "string" },
              },
              highlights: { type: "array", items: { type: "string" } },
              tips: { type: "array", items: { type: "string" } },
              services: { type: "array", items: { type: "string" } },
            },
            required: ["day_number", "narrative"],
          },
        },
        practical_info: {
          type: "object",
          description: "Practical information for the destination(s).",
          properties: {
            best_time_to_visit: { type: "string" },
            weather: { type: "string" },
            currency: { type: "string" },
            language: { type: "string" },
            plug_type: { type: "string" },
            tipping: { type: "string" },
            documents: { type: "array", items: { type: "string" } },
            what_to_pack: { type: "array", items: { type: "string" } },
            health_safety: { type: "array", items: { type: "string" } },
            emergency_contacts: { type: "array", items: { type: "string" } },
          },
        },
        trip_management: {
          type: "object",
          description: "Operational trip management details.",
          properties: {
            arrival_instructions: { type: "string" },
            checkin_checkout_policy: { type: "string" },
            transfers_overview: { type: "string" },
            guide_language: { type: "string" },
            support_24_7: { type: "string" },
            cancellation_policy: { type: "string" },
            payment_terms: { type: "string" },
          },
        },
        inclusions: { type: "array", items: { type: "string" } },
        exclusions: { type: "array", items: { type: "string" } },
        notes: { type: "array", items: { type: "string" } },
        tour_program: {
          type: "object",
          description: "Conteúdo promocional do programa turístico (sem preços). Preencher quando solicitado.",
          properties: {
            intro: { type: "string", description: "Parágrafo de abertura promocional do pacote (3-5 frases)." },
            cities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  country: { type: "string" },
                  short_description: { type: "string" },
                  highlights: { type: "array", items: { type: "string" } },
                },
                required: ["name", "short_description"],
              },
            },
            inclusions_narrative: { type: "string", description: "Texto descritivo apresentando hotéis, voos e serviços de forma promocional, sem valores." },
            closing: { type: "string", description: "Chamada final inspiracional convidando o cliente a embarcar." },
          },
        },
      },
      required: ["title", "intro", "inclusions", "exclusions"],
    },
  },
};

function fmtMoney(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${ccy} ${n.toFixed(2)}`;
  }
}

function P(text: string, opts: { bold?: boolean; size?: number; heading?: any; align?: any } = {}) {
  return new Paragraph({
    heading: opts.heading,
    alignment: opts.align,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, font: "Arial" })],
  });
}

function cell(text: string, opts: { bold?: boolean; bg?: string; width: number; align?: any } = { width: 2000 }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, bold: opts.bold, font: "Arial", size: 20 })],
      }),
    ],
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const quoteId: string = body.quote_id;
    const docType: "executive" | "tour_program" | "combined" = ["executive","tour_program","combined"].includes(body.doc_type) ? body.doc_type : "executive";
    const priceMode: PriceMode = body.price_mode ?? "detailed";
    const format: "docx" | "pdf" = body.format === "pdf" ? "pdf" : "docx";
    const lang: Lang = (body.language ?? "en") as Lang;
    const tone: string = body.tone ?? "inspirational";
    const includeItinerary: boolean = body.include_itinerary !== false;
    const includeSchedule: boolean = body.include_schedule !== false;
    const includeCityHighlights: boolean = body.include_city_highlights !== false;
    const includeItemDescriptions: boolean = body.include_item_descriptions !== false;
    const briefing: string = String(body.briefing ?? "").slice(0, 2000).trim();
    const L = LABELS[lang] ?? LABELS.en;

    // Load quote, items, lead, customer
    const { data: quote, error: qErr } = await admin
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .maybeSingle();
    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: "quote_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: itemsRaw } = await admin
      .from("quote_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("item_date", { ascending: true });

    const items = (itemsRaw ?? []).map((r: any) => ({
      ...r,
      description: String(r.description ?? "").replace(/^\[(HOTEL|SERVICE)\]\s*/, ""),
    }));

    let lead: any = null;
    if (quote.lead_id) {
      const { data } = await admin.from("leads").select("*").eq("id", quote.lead_id).maybeSingle();
      lead = data;
    }
    let customer: any = null;
    if (quote.customer_id) {
      const { data } = await admin
        .from("customers")
        .select("*")
        .eq("id", quote.customer_id)
        .maybeSingle();
      customer = data;
    }

    // Compute totals (using stored unit_price/total to match the editor)
    const subtotal = items.reduce((s: number, it: any) => s + Number(it.total ?? 0), 0);
    const bankFee = Number(quote.discount ?? 0);
    const total = subtotal + bankFee;
    const ccy: string = quote.currency ?? "USD";

    // Ask AI for narrative content
    const langName = { pt: "Portuguese", en: "English", es: "Spanish", ru: "Russian" }[lang];
    const userBrief = {
      destination: lead?.destination ?? null,
      pax: items[0]?.pax ?? null,
      items: items.map((it: any) => ({
        kind: it.kind,
        description: it.description,
        city: it.city,
        item_date: it.item_date,
        check_out: it.check_out,
      })),
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are a SENIOR TOUR OPERATOR with 20+ years designing tailor-made trips in South America. You do not write marketing copy alone — you deliver a COMPLETE OPERATIONAL ITINERARY and full TRIP MANAGEMENT for the client.

Always reply by calling the tool 'build_proposal_content'. Tone: ${tone}. Language: ${langName}.

For EACH day, provide:
- A vivid descriptive narrative (experience, atmosphere, gastronomy, cultural context).
- 'schedule': hour-by-hour planned activities (suggested times like 09:00, 12:30, etc.).
- 'transfers': all logistical movements (e.g. "Airport GIG → Hotel Copacabana, ~45min by private car").
- 'meals_included': breakfast/lunch/dinner included that day.
- 'highlights': 2-4 bullet points of the day's highlights.
- 'tips': 2-4 practical local tips (dress code, money, crowd timing, photo spots).

Provide a 'practical_info' block covering: best time to visit, weather expected for the dates, currency, language, plug type, tipping culture, required documents (passport validity, visa, vaccines if applicable), what to pack, health & safety guidance, and generic emergency contacts (e.g. 190 police BR, 192 ambulance BR, embassy hint).

Provide a 'trip_management' block covering: how the client will be received at the airport, check-in/check-out policy, transfers overview, guide language, 24/7 local coordinator support details, standard cancellation policy, and standard payment terms.

Inclusions/exclusions must reflect what was quoted (hotels with meal plan, transfers, tours) plus standard exclusions (international flights unless quoted, visas, tips, personal expenses, optional tours).

NEVER mention internal costs, markup, or supplier names. Speak as the operator delivering the trip.

If an "Operator briefing" is provided in the user message, treat it as the HIGHEST-PRIORITY guidance: it overrides generic assumptions about audience, style, pace, focus, dietary or mobility restrictions and special requests. Tailor every day, tip and recommendation to it.`,
          },
          {
            role: "user",
            content: `Quote brief (JSON):\n${JSON.stringify(userBrief, null, 2)}\n\n${
              briefing
                ? `**Operator briefing (follow strictly):**\n${briefing}\n\n`
                : ""
            }${
              includeItinerary
                ? "Include a detailed day-by-day narrative."
                : "Skip the day-by-day; only return title, subtitle, intro, inclusions, exclusions, notes."
            }\n\nDocument type requested: ${docType}.\n${
              docType === "tour_program" || docType === "combined"
                ? `Also fill the 'tour_program' object with: a promotional 'intro' (3-5 sentences), 'cities' array (one per distinct destination city with short_description${includeCityHighlights ? " and 3-5 highlights" : ""}), 'inclusions_narrative' (a flowing promotional paragraph${includeItemDescriptions ? " describing each hotel, flight and signature service" : ""} — DO NOT include any prices or monetary values), and a 'closing' inspirational call-to-action.`
                : ""
            }${
              docType === "executive" || docType === "combined"
                ? "\nAlso provide 'executive_summary' (2-4 sentences listing hotels, flights, main experiences sold)."
                : ""
            }`,
          },
        ],
        tools: [CONTENT_TOOL],
        tool_choice: { type: "function", function: { name: "build_proposal_content" } },
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: aiRes.status === 429 ? "rate_limited" : "credits_exhausted" }),
        { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
    let content: any = {
      title: lead?.destination ? `${lead.destination}` : L.proposal,
      subtitle: "",
      intro: "",
      days: [],
      inclusions: [],
      exclusions: [],
      notes: [],
    };
    if (toolCall?.function?.arguments) {
      try {
        content = { ...content, ...JSON.parse(toolCall.function.arguments) };
      } catch (e) {
        console.error("parse content failed", e);
      }
    }

    // Build .docx
    const children: any[] = [];

    // Cover
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: content.title, bold: true, font: "Arial", size: 48 })],
      }),
    );
    if (content.subtitle) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: content.subtitle, font: "Arial", size: 28, color: "555555" }),
          ],
        }),
      );
    }
    if (customer?.full_name) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: customer.full_name, font: "Arial", size: 24 })],
        }),
      );
    }
    children.push(P(""));
    if (content.intro) children.push(P(content.intro, { size: 22 }));

    const isExecutive = docType === "executive" || docType === "combined";
    const isProgram = docType === "tour_program" || docType === "combined";

    // ===== TOUR PROGRAM SECTION (promotional, no prices) =====
    if (isProgram && content.tour_program && typeof content.tour_program === "object") {
      const tp = content.tour_program;
      children.push(P(""));
      children.push(P("Programa Turístico", { bold: true, size: 32, heading: HeadingLevel.HEADING_1 }));
      if (tp.intro) children.push(P(String(tp.intro), { size: 22 }));

      if (Array.isArray(tp.cities) && tp.cities.length > 0) {
        children.push(P(""));
        children.push(P("Destinos", { bold: true, size: 26, heading: HeadingLevel.HEADING_2 }));
        for (const c of tp.cities) {
          const head = `${c.name ?? ""}${c.country ? ` — ${c.country}` : ""}`;
          children.push(P(head, { bold: true, size: 24, heading: HeadingLevel.HEADING_3 }));
          if (c.short_description) children.push(P(String(c.short_description), { size: 22 }));
          if (includeCityHighlights && Array.isArray(c.highlights) && c.highlights.length > 0) {
            for (const h of c.highlights) {
              children.push(new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: String(h), font: "Arial", size: 22 })],
              }));
            }
          }
          children.push(P(""));
        }
      }

      if (includeItemDescriptions && tp.inclusions_narrative) {
        children.push(P("O que está incluído na sua viagem", { bold: true, size: 26, heading: HeadingLevel.HEADING_2 }));
        children.push(P(String(tp.inclusions_narrative), { size: 22 }));
      }

      if (tp.closing) {
        children.push(P(""));
        children.push(P(String(tp.closing), { size: 22 }));
      }

      if (docType === "combined") {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }

    // Executive summary (descritivo dos produtos vendidos) - only for executive/combined
    if (isExecutive && content.executive_summary) {
      children.push(P(""));
      children.push(P("Descritivo Executivo", { bold: true, size: 28, heading: HeadingLevel.HEADING_1 }));
      children.push(P(String(content.executive_summary), { size: 22 }));
    }

    // Cronograma consolidado (datas + horários)
    if (isExecutive && includeSchedule) {
      // Build flat schedule from items + flights
      const { data: flightsRaw } = await admin
        .from("quote_flights")
        .select("flight_date, departure_time, arrival_time, from_code, to_code, flight_number")
        .eq("quote_id", quoteId)
        .order("flight_date", { ascending: true });

      type SchedRow = {
        date: string;
        time: string;     // HH:MM, "" sorts first within day
        sortKey: number;  // tie-breaker: check-in/flight-arrival come before tours, check-out last
        activity: string;
        place: string;
      };
      const sched: SchedRow[] = [];

      // Helpers: extract stored times from the structured notes
      // applyProgramToQuote writes:
      //   hotel:   "Check-in HH:MM · Check-out HH:MM[ · ...]"
      //   flight:  "Saída HH:MM → Chegada HH:MM[ · ...]"
      //   service: "HH:MM[–HH:MM][ · Duração: ...]"
      const HHMM = /([01]?\d|2[0-3]):([0-5]\d)/;
      const norm = (m: RegExpMatchArray | null) =>
        m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
      const extractHotelTimes = (notes: string | null) => {
        const s = String(notes ?? "");
        const ci = s.match(/Check-?in\s+([01]?\d|2[0-3]):([0-5]\d)/i);
        const co = s.match(/Check-?out\s+([01]?\d|2[0-3]):([0-5]\d)/i);
        return { checkIn: norm(ci) || "15:00", checkOut: norm(co) || "11:00" };
      };
      const extractServiceStart = (notes: string | null) => {
        const s = String(notes ?? "");
        // First HH:MM token (start time)
        const m = s.match(HHMM);
        return norm(m);
      };

      for (const it of items) {
        if (it.kind === "hotel") {
          const { checkIn, checkOut } = extractHotelTimes(it.notes);
          if (it.item_date) {
            sched.push({
              date: String(it.item_date),
              time: checkIn,
              sortKey: 0, // check-in first when arriving
              activity: `Check-in ${it.description}`,
              place: it.city ?? "—",
            });
          }
          if (it.check_out) {
            sched.push({
              date: String(it.check_out),
              time: checkOut,
              sortKey: 9, // check-out last on its day
              activity: `Check-out ${it.description}`,
              place: it.city ?? "—",
            });
          }
        } else {
          if (!it.item_date) continue;
          const t = extractServiceStart(it.notes);
          sched.push({
            date: String(it.item_date),
            time: t || "—",
            sortKey: 5,
            activity: it.description,
            place: it.city ?? "—",
          });
        }
      }
      for (const f of flightsRaw ?? []) {
        const dep = String(f.departure_time ?? "").slice(0, 5);
        sched.push({
          date: String(f.flight_date),
          time: dep || "—",
          sortKey: 1, // flights before ground services
          activity: `Voo ${f.flight_number ?? ""} ${f.from_code} → ${f.to_code}${
            f.arrival_time ? ` (chegada ${String(f.arrival_time).slice(0, 5)})` : ""
          }`.trim(),
          place: f.from_code,
        });
      }
      sched.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        // Unknown times ("—") go to the end of the day
        const at = a.time === "—" ? "99:99" : a.time;
        const bt = b.time === "—" ? "99:99" : b.time;
        if (at !== bt) return at.localeCompare(bt);
        return a.sortKey - b.sortKey;
      });
      if (sched.length > 0) {
        children.push(P(""));
        children.push(P(L.schedule, { bold: true, size: 28, heading: HeadingLevel.HEADING_1 }));
        const sw = [1500, 1100, 5260, 1500];
        const rows: TableRow[] = [
          new TableRow({ tableHeader: true, children: [
            cell(L.date, { bold: true, bg: "D5E8F0", width: sw[0] }),
            cell(L.time, { bold: true, bg: "D5E8F0", width: sw[1] }),
            cell(L.activity, { bold: true, bg: "D5E8F0", width: sw[2] }),
            cell(L.city, { bold: true, bg: "D5E8F0", width: sw[3] }),
          ]}),
          ...sched.map((s) => new TableRow({ children: [
            cell(s.date, { width: sw[0] }),
            cell(s.time, { width: sw[1] }),
            cell(s.activity, { width: sw[2] }),
            cell(s.place, { width: sw[3] }),
          ]})),
        ];
        children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: sw, rows }));
      }
    }

    const totalWidth = 9360;
    // Pricing (only on executive/combined)
    if (isExecutive) {
    children.push(P(""));
    children.push(P(L.pricing, { bold: true, size: 28, heading: HeadingLevel.HEADING_1 }));

    if (priceMode === "final") {
      const t = new Table({
        width: { size: totalWidth, type: WidthType.DXA },
        columnWidths: [6360, 3000],
        rows: [
          new TableRow({
            children: [
              cell(L.total, { bold: true, bg: "EAEAEA", width: 6360 }),
              cell(fmtMoney(total, ccy), {
                bold: true,
                bg: "EAEAEA",
                width: 3000,
                align: AlignmentType.RIGHT,
              }),
            ],
          }),
        ],
      });
      children.push(t);
    } else {
      // detailed (category_table falls back to detailed for now)
      const colWidths = [1400, 4760, 800, 1200, 1200];
      const rows: TableRow[] = [
        new TableRow({
          tableHeader: true,
          children: [
            cell(L.date, { bold: true, bg: "D5E8F0", width: colWidths[0] }),
            cell(L.description, { bold: true, bg: "D5E8F0", width: colWidths[1] }),
            cell(L.qty, { bold: true, bg: "D5E8F0", width: colWidths[2], align: AlignmentType.RIGHT }),
            cell(L.price, { bold: true, bg: "D5E8F0", width: colWidths[3], align: AlignmentType.RIGHT }),
            cell(L.subtotal, { bold: true, bg: "D5E8F0", width: colWidths[4], align: AlignmentType.RIGHT }),
          ],
        }),
      ];
      for (const it of items) {
        const dt = it.item_date
          ? it.check_out
            ? `${it.item_date} → ${it.check_out}`
            : it.item_date
          : "—";
        rows.push(
          new TableRow({
            children: [
              cell(dt, { width: colWidths[0] }),
              cell(it.description, { width: colWidths[1] }),
              cell(String(it.quantity ?? 1), { width: colWidths[2], align: AlignmentType.RIGHT }),
              cell(fmtMoney(Number(it.unit_price ?? 0), ccy), {
                width: colWidths[3],
                align: AlignmentType.RIGHT,
              }),
              cell(fmtMoney(Number(it.total ?? 0), ccy), {
                width: colWidths[4],
                align: AlignmentType.RIGHT,
              }),
            ],
          }),
        );
      }
      rows.push(
        new TableRow({
          children: [
            cell(L.total, { bold: true, bg: "EAEAEA", width: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] }),
            cell("", { bold: true, bg: "EAEAEA", width: 0 }),
            cell("", { bold: true, bg: "EAEAEA", width: 0 }),
            cell("", { bold: true, bg: "EAEAEA", width: 0 }),
            cell(fmtMoney(total, ccy), {
              bold: true,
              bg: "EAEAEA",
              width: colWidths[4],
              align: AlignmentType.RIGHT,
            }),
          ],
        }),
      );
      children.push(
        new Table({
          width: { size: totalWidth, type: WidthType.DXA },
          columnWidths: colWidths,
          rows,
        }),
      );
    }
    } // end isExecutive pricing

    // Helpers for sub-blocks
    const bullet = (text: string) =>
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text, font: "Arial", size: 22 })],
      });
    const labeledList = (label: string, arr: any) => {
      if (!Array.isArray(arr) || arr.length === 0) return;
      children.push(P(label + ":", { bold: true, size: 22 }));
      for (const v of arr) children.push(bullet(String(v)));
    };
    const labeledLine = (label: string, value: any) => {
      if (!value) return;
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${label}: `, bold: true, font: "Arial", size: 22 }),
            new TextRun({ text: String(value), font: "Arial", size: 22 }),
          ],
        }),
      );
    };

    // Itinerary
    if (includeItinerary && Array.isArray(content.days) && content.days.length > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(P(L.itinerary, { bold: true, size: 32, heading: HeadingLevel.HEADING_1 }));
      for (const d of content.days) {
        const head = `${L.day} ${d.day_number}${d.city ? " | " + d.city : ""}${d.title ? " — " + d.title : ""}`;
        children.push(P(head, { bold: true, size: 26, heading: HeadingLevel.HEADING_2 }));
        if (d.date) children.push(P(String(d.date), { size: 20 }));
        if (d.narrative) children.push(P(d.narrative, { size: 22 }));

        // Schedule table
        if (Array.isArray(d.schedule) && d.schedule.length > 0) {
          children.push(P(L.schedule + ":", { bold: true, size: 22 }));
          const sw = [1800, 7560];
          const schedRows: TableRow[] = [
            new TableRow({
              tableHeader: true,
              children: [
                cell(L.time, { bold: true, bg: "D5E8F0", width: sw[0] }),
                cell(L.activity, { bold: true, bg: "D5E8F0", width: sw[1] }),
              ],
            }),
            ...d.schedule.map(
              (s: any) =>
                new TableRow({
                  children: [
                    cell(String(s.time ?? ""), { width: sw[0] }),
                    cell(String(s.activity ?? ""), { width: sw[1] }),
                  ],
                }),
            ),
          ];
          children.push(
            new Table({
              width: { size: totalWidth, type: WidthType.DXA },
              columnWidths: sw,
              rows: schedRows,
            }),
          );
          children.push(P(""));
        }

        labeledList(L.transfers, d.transfers);
        labeledList(L.mealsIncluded, d.meals_included);
        labeledList(L.highlights, d.highlights);
        labeledList(L.tips, d.tips);
        labeledList(L.services, d.services);
        children.push(P(""));
      }
    }

    // Inclusions / Exclusions / Notes
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(P(L.includes, { bold: true, size: 28, heading: HeadingLevel.HEADING_1 }));
    for (const inc of content.inclusions ?? []) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: inc, font: "Arial", size: 22 })],
        }),
      );
    }
    children.push(P(""));
    children.push(P(L.excludes, { bold: true, size: 28, heading: HeadingLevel.HEADING_1 }));
    for (const ex of content.exclusions ?? []) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: ex, font: "Arial", size: 22 })],
        }),
      );
    }
    if (Array.isArray(content.notes) && content.notes.length > 0) {
      children.push(P(""));
      children.push(P(L.notes, { bold: true, size: 28, heading: HeadingLevel.HEADING_1 }));
      for (const n of content.notes) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: n, font: "Arial", size: 22 })],
          }),
        );
      }
    }

    // Practical information
    const pi = content.practical_info;
    if (pi && typeof pi === "object") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(P(L.practicalInfo, { bold: true, size: 32, heading: HeadingLevel.HEADING_1 }));
      labeledLine(L.bestTime, pi.best_time_to_visit);
      labeledLine(L.weather, pi.weather);
      labeledLine(L.currency, pi.currency);
      labeledLine(L.languageLabel, pi.language);
      labeledLine(L.plugType, pi.plug_type);
      labeledLine(L.tipping, pi.tipping);
      labeledList(L.documents, pi.documents);
      labeledList(L.whatToPack, pi.what_to_pack);
      labeledList(L.healthSafety, pi.health_safety);
      labeledList(L.emergencyContacts, pi.emergency_contacts);
    }

    // Trip management
    const tm = content.trip_management;
    if (tm && typeof tm === "object") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(P(L.tripManagement, { bold: true, size: 32, heading: HeadingLevel.HEADING_1 }));
      labeledLine(L.arrivalInstructions, tm.arrival_instructions);
      labeledLine(L.checkinPolicy, tm.checkin_checkout_policy);
      labeledLine(L.transfersOverview, tm.transfers_overview);
      labeledLine(L.guideLanguage, tm.guide_language);
      labeledLine(L.support247, tm.support_24_7);
      labeledLine(L.cancellationPolicy, tm.cancellation_policy);
      labeledLine(L.paymentTerms, tm.payment_terms);
    }

    if (quote.valid_until) {
      children.push(P(""));
      children.push(P(`${L.validUntil}: ${quote.valid_until}`, { size: 20, bold: true }));
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    // Upload
    const safeTitle = (content.title || "proposal")
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60) || "proposal";
    const docPrefix = docType === "tour_program" ? "programa-turistico" : docType === "combined" ? "proposta-completa" : "proposta-executiva";
    const fileName = `${docPrefix}_${safeTitle}_${Date.now()}.docx`;
    const path = `${userId}/${quoteId}/${fileName}`;

    const { error: upErr } = await admin.storage
      .from("proposal-docs")
      .upload(path, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
    if (upErr) {
      console.error("upload error", upErr);
      return new Response(JSON.stringify({ error: "upload_failed", detail: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert document row
    const { data: docRow, error: docErr } = await admin
      .from("quote_documents")
      .insert({
        quote_id: quoteId,
        created_by: userId,
        format: "docx",
        price_mode: priceMode,
        language: lang,
        tone,
        include_itinerary: includeItinerary,
        storage_path: path,
        title: content.title,
      })
      .select()
      .single();
    if (docErr) console.error("doc row error", docErr);

    // Signed URL for immediate download
    const { data: signed } = await admin.storage
      .from("proposal-docs")
      .createSignedUrl(path, 3600);

    return new Response(
      JSON.stringify({
        ok: true,
        document: docRow,
        signed_url: signed?.signedUrl ?? null,
        file_name: fileName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-proposal-doc error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
