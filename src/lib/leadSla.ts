// SLA thresholds (days) per lead status. Lead is "at risk" if there has
// been no interaction for longer than the threshold.
export const LEAD_SLA_DAYS: Record<string, number> = {
  novo: 2,
  qualificado: 5,
  cotacao: 7,
  proposta: 7,
};

const IGNORED = new Set(["fechado", "perdido"]);

export type LeadSlaInfo = {
  level: "ok" | "warning" | "overdue";
  daysSinceLast: number | null;
  threshold: number | null;
  nextActionOverdue: boolean;
};

export function computeLeadSla(input: {
  status: string;
  updated_at: string | null;
  next_action_date: string | null;
  lastInteractionAt: string | null;
}): LeadSlaInfo {
  if (IGNORED.has(input.status)) {
    return { level: "ok", daysSinceLast: null, threshold: null, nextActionOverdue: false };
  }
  const threshold = LEAD_SLA_DAYS[input.status] ?? 7;
  const ref = input.lastInteractionAt ?? input.updated_at;
  const daysSinceLast = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) : null;
  const nextActionOverdue = !!input.next_action_date && new Date(input.next_action_date).getTime() < Date.now();

  let level: LeadSlaInfo["level"] = "ok";
  if (nextActionOverdue) level = "overdue";
  if (daysSinceLast !== null && daysSinceLast > threshold) level = "overdue";
  else if (level !== "overdue" && daysSinceLast !== null && daysSinceLast >= Math.max(1, threshold - 1)) level = "warning";

  return { level, daysSinceLast, threshold, nextActionOverdue };
}
