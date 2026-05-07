import { supabase } from "@/integrations/supabase/client";

export type TourProgram = {
  summary: string;
  language?: string;
  days: Array<{
    day: number;
    date?: string;
    city: string;
    morning?: string;
    afternoon?: string;
    evening?: string;
    schedule?: Array<{ time: string; title: string; description?: string; kind?: string }>;
  }>;
  hotels: Array<{
    city: string;
    name?: string;
    category?: string;
    nights: number;
    rooms?: number;
    check_in?: string;
    check_out?: string;
    check_in_time?: string;
    check_out_time?: string;
    notes?: string;
  }>;
  flights: Array<{
    from: string;
    to: string;
    date?: string;
    departure_time?: string;
    arrival_time?: string;
    class?: string;
    pax?: number;
    notes?: string;
  }>;
  services: Array<{
    day?: number;
    date?: string;
    start_time?: string;
    end_time?: string;
    city?: string;
    kind: "tour" | "transfer" | "service";
    description: string;
    pax?: number;
    duration?: string;
  }>;
  notes?: string;
};

export type ApplyResult = {
  inserted: number;
  hotels: number;
  flights: number;
  services: number;
  needCost: number;
};

/**
 * Insere os itens estruturados do programa na cotação.
 * Custos ficam zerados — o operador preenche depois usando o pricing-engine.
 */
export async function applyProgramToQuote(
  program: TourProgram,
  quoteId: string,
  opts: { clearExisting?: boolean } = {},
): Promise<ApplyResult> {
  if (opts.clearExisting) {
    await supabase.from("quote_items").delete().eq("quote_id", quoteId);
  }

  const rows: any[] = [];
  let needCost = 0;

  for (const h of program.hotels ?? []) {
    const qty = Math.max(1, (h.nights || 1) * (h.rooms || 1));
    rows.push({
      quote_id: quoteId,
      kind: "hotel",
      description:
        [h.name, h.category, h.city].filter(Boolean).join(" — ") || `Hotel em ${h.city}`,
      quantity: qty,
      unit_cost: 0,
      markup_pct: 25,
      unit_price: 0,
      total: 0,
      city: h.city || null,
      category: h.category || null,
      nights: h.nights || null,
      rooms: h.rooms || 1,
      item_date: h.check_in || null,
      check_out: h.check_out || null,
      notes: [
        h.check_in_time || h.check_out_time
          ? `Check-in ${h.check_in_time || "15:00"} · Check-out ${h.check_out_time || "11:00"}`
          : null,
        h.notes || null,
      ].filter(Boolean).join(" · ") || null,
    });
    needCost++;
  }

  for (const f of program.flights ?? []) {
    rows.push({
      quote_id: quoteId,
      kind: "service",
      description: `Voo ${f.from} → ${f.to}${f.class ? ` (${f.class})` : ""}`,
      quantity: f.pax || 1,
      unit_cost: 0,
      markup_pct: 15,
      unit_price: 0,
      total: 0,
      city: f.to || null,
      category: "voo",
      item_date: f.date || null,
      pax: f.pax || null,
      notes: [
        f.departure_time || f.arrival_time
          ? `Saída ${f.departure_time || "—"} → Chegada ${f.arrival_time || "—"}`
          : null,
        f.notes || null,
      ].filter(Boolean).join(" · ") || null,
    });
    needCost++;
  }

  for (const s of program.services ?? []) {
    rows.push({
      quote_id: quoteId,
      kind: "service",
      description: s.description,
      quantity: s.pax || 1,
      unit_cost: 0,
      markup_pct: 30,
      unit_price: 0,
      total: 0,
      city: s.city || null,
      category: s.kind,
      item_date: s.date || null,
      pax: s.pax || null,
      notes: [
        s.start_time ? `${s.start_time}${s.end_time ? `–${s.end_time}` : ""}` : null,
        s.duration ? `Duração: ${s.duration}` : null,
      ].filter(Boolean).join(" · ") || null,
    });
    needCost++;
  }

  if (rows.length === 0) {
    return { inserted: 0, hotels: 0, flights: 0, services: 0, needCost: 0 };
  }

  const { error } = await supabase.from("quote_items").insert(rows);
  if (error) throw error;

  // Salva o resumo do programa em quotes.notes (concatenado)
  const programNote = `\n\n--- Programa IA ---\n${program.summary}\n${
    program.notes ? `\nObs: ${program.notes}` : ""
  }`;
  const { data: q } = await supabase.from("quotes").select("notes").eq("id", quoteId).maybeSingle();
  await supabase
    .from("quotes")
    .update({ notes: ((q?.notes as string) || "") + programNote })
    .eq("id", quoteId);

  return {
    inserted: rows.length,
    hotels: program.hotels?.length ?? 0,
    flights: program.flights?.length ?? 0,
    services: program.services?.length ?? 0,
    needCost,
  };
}
