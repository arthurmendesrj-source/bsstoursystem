import { supabase } from "@/integrations/supabase/client";

// Default SLA thresholds (in HOURS) per lead status. Used as fallback when
// the dynamic settings have not been loaded yet (or for unknown stages).
export const DEFAULT_SLA_HOURS: Record<string, { warning: number; overdue: number }> = {
  novo: { warning: 24, overdue: 48 },
  qualificado: { warning: 96, overdue: 120 },
  cotacao: { warning: 144, overdue: 168 },
  proposta: { warning: 144, overdue: 168 },
};

// Backwards-compatible export: thresholds in DAYS, derived from overdue hours.
export const LEAD_SLA_DAYS: Record<string, number> = Object.fromEntries(
  Object.entries(DEFAULT_SLA_HOURS).map(([k, v]) => [k, Math.round(v.overdue / 24)]),
);

const IGNORED = new Set(["fechado", "perdido"]);

// In-memory cache populated once per session by ensureSlaSettingsLoaded().
let slaCache: Record<string, { warning: number; overdue: number }> | null = null;
let slaLoadingPromise: Promise<void> | null = null;

export async function ensureSlaSettingsLoaded(): Promise<void> {
  if (slaCache) return;
  if (slaLoadingPromise) return slaLoadingPromise;
  slaLoadingPromise = (async () => {
    try {
      const { data } = await supabase
        .from("sla_settings")
        .select("stage,warning_hours,overdue_hours");
      const map: Record<string, { warning: number; overdue: number }> = { ...DEFAULT_SLA_HOURS };
      for (const row of (data ?? []) as { stage: string; warning_hours: number; overdue_hours: number }[]) {
        map[row.stage] = { warning: row.warning_hours, overdue: row.overdue_hours };
      }
      slaCache = map;
    } catch {
      slaCache = { ...DEFAULT_SLA_HOURS };
    } finally {
      slaLoadingPromise = null;
    }
  })();
  return slaLoadingPromise;
}

export function invalidateSlaSettingsCache() {
  slaCache = null;
}

export function getSlaThresholds(status: string): { warning: number; overdue: number } {
  return (slaCache ?? DEFAULT_SLA_HOURS)[status] ?? { warning: 120, overdue: 168 };
}

export type LeadSlaInfo = {
  level: "ok" | "warning" | "overdue";
  daysSinceLast: number | null;
  threshold: number | null; // overdue threshold in DAYS (kept for back-compat with UI)
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
  const { warning: warnHours, overdue: overdueHours } = getSlaThresholds(input.status);
  const ref = input.lastInteractionAt ?? input.updated_at;
  const hoursSinceLast = ref ? (Date.now() - new Date(ref).getTime()) / 3600_000 : null;
  const daysSinceLast = hoursSinceLast !== null ? Math.floor(hoursSinceLast / 24) : null;
  const nextActionOverdue = !!input.next_action_date && new Date(input.next_action_date).getTime() < Date.now();

  let level: LeadSlaInfo["level"] = "ok";
  if (nextActionOverdue) level = "overdue";
  if (hoursSinceLast !== null && hoursSinceLast > overdueHours) level = "overdue";
  else if (level !== "overdue" && hoursSinceLast !== null && hoursSinceLast >= warnHours) level = "warning";

  return { level, daysSinceLast, threshold: Math.round(overdueHours / 24), nextActionOverdue };
}
