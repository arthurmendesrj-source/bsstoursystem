import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { computeLeadSla, ensureSlaSettingsLoaded, type LeadSlaInfo } from "@/lib/leadSla";

export type LeadAlert = {
  id: string;
  name: string;
  status: string;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
  assigned_to: string | null;
  created_by: string | null;
  phone: string | null;
  email: string | null;
  destination: string | null;
  lastInteractionAt: string | null;
  lastInteractionType: string | null;
  recent: boolean;
  snoozedUntil: number | null;
  sla: LeadSlaInfo;
};

const RECENT_MS = 60_000;
const LEGACY_SNOOZE_KEY = "lead-alerts-snooze-v1";
// Module-level dedupe so multiple consumers don't emit duplicate toasts
const toastedOverdue = new Set<string>();
// In-memory cache shared across hook instances for instant render
const snoozeCache = new Map<string, number>();
let snoozeMigrated = false;

async function migrateLegacySnoozes(userId: string) {
  if (snoozeMigrated || typeof window === "undefined") return;
  snoozeMigrated = true;
  try {
    const raw = window.localStorage.getItem(LEGACY_SNOOZE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const rows = Object.entries(parsed)
      .filter(([, ts]) => typeof ts === "number" && ts > now)
      .map(([lead_id, ts]) => ({
        lead_id,
        user_id: userId,
        snoozed_until: new Date(ts).toISOString(),
      }));
    if (rows.length > 0) {
      await supabase.from("lead_alert_snoozes").upsert(rows, { onConflict: "lead_id,user_id" });
    }
    window.localStorage.removeItem(LEGACY_SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

export function useLeadAlerts(userId: string | null | undefined, isAdmin: boolean) {
  const [alerts, setAlerts] = useState<LeadAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [followupsToday, setFollowupsToday] = useState(0);
  const [snoozeTick, setSnoozeTick] = useState(0);
  const recentRef = useRef<Map<string, number>>(new Map());
  const prevLevelsRef = useRef<Map<string, "ok" | "warning" | "overdue">>(new Map());
  const firstRunRef = useRef(true);

  const markRecent = useCallback((leadId: string) => {
    recentRef.current.set(leadId, Date.now());
  }, []);

  const loadSnoozes = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("lead_alert_snoozes")
      .select("lead_id,snoozed_until")
      .eq("user_id", userId)
      .gt("snoozed_until", new Date().toISOString());
    snoozeCache.clear();
    for (const row of (data ?? []) as { lead_id: string; snoozed_until: string }[]) {
      snoozeCache.set(row.lead_id, new Date(row.snoozed_until).getTime());
    }
  }, [userId]);

  const snooze = useCallback(async (leadId: string, hours: number) => {
    if (!userId) return;
    const until = Date.now() + hours * 3600_000;
    snoozeCache.set(leadId, until);
    setSnoozeTick((t) => t + 1);
    await supabase.from("lead_alert_snoozes").upsert(
      { lead_id: leadId, user_id: userId, snoozed_until: new Date(until).toISOString() },
      { onConflict: "lead_id,user_id" },
    );
  }, [userId]);

  const unsnooze = useCallback(async (leadId: string) => {
    if (!userId) return;
    snoozeCache.delete(leadId);
    setSnoozeTick((t) => t + 1);
    await supabase.from("lead_alert_snoozes").delete().eq("user_id", userId).eq("lead_id", leadId);
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await ensureSlaSettingsLoaded();
    let q = supabase
      .from("leads")
      .select("id,name,status,next_action,next_action_date,updated_at,assigned_to,created_by,phone,email,destination")
      .not("status", "in", "(fechado,perdido)");
    if (!isAdmin) {
      q = q.or(`assigned_to.eq.${userId},created_by.eq.${userId}`);
    }
    const { data: leads } = await q;
    const ids = (leads ?? []).map((l) => l.id);
    const lastByLead = new Map<string, { occurred_at: string; type: string | null }>();
    if (ids.length > 0) {
      const { data: ints } = await supabase
        .from("interactions")
        .select("lead_id,occurred_at,type")
        .in("lead_id", ids)
        .order("occurred_at", { ascending: false });
      for (const it of (ints ?? []) as { lead_id: string | null; occurred_at: string; type: string | null }[]) {
        if (it.lead_id && !lastByLead.has(it.lead_id)) lastByLead.set(it.lead_id, { occurred_at: it.occurred_at, type: it.type });
      }
    }

    // Follow-ups completed by current user today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .gte("occurred_at", startOfDay.toISOString());
    setFollowupsToday(count ?? 0);

    const snoozed = Object.fromEntries(snoozeCache);
    const now = Date.now();
    const computedAll = (leads ?? []).map((l) => {
      const last = lastByLead.get(l.id) ?? null;
      const sla = computeLeadSla({
        status: l.status,
        updated_at: l.updated_at,
        next_action_date: l.next_action_date,
        lastInteractionAt: last?.occurred_at ?? null,
      });
      const markedAt = recentRef.current.get(l.id);
      const recent = !!markedAt && now - markedAt < RECENT_MS;
      return {
        ...l,
        lastInteractionAt: last?.occurred_at ?? null,
        lastInteractionType: last?.type ?? null,
        recent,
        snoozedUntil: snoozed[l.id] ?? null,
        sla,
      } as LeadAlert;
    });

    // Detect transitions to "overdue" and toast (skip first run to avoid burst)
    if (!firstRunRef.current) {
      for (const a of computedAll) {
        const prev = prevLevelsRef.current.get(a.id);
        const isSnoozed = !!a.snoozedUntil && a.snoozedUntil > Date.now();
        if (a.sla.level === "overdue" && prev && prev !== "overdue" && !toastedOverdue.has(a.id) && !isSnoozed) {
          toastedOverdue.add(a.id);
          const desc = a.sla.daysSinceLast !== null ? `${a.sla.daysSinceLast} dia(s) sem contato` : undefined;
          toast.warning(`${a.name}: SLA atrasado`, { description: desc });
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              const n = new Notification(`${a.name}: SLA atrasado`, {
                body: desc,
                tag: `lead-overdue-${a.id}`,
                icon: "/favicon.ico",
              });
              n.onclick = () => {
                window.focus();
                window.location.href = `/leads/${a.id}`;
                n.close();
              };
            } catch { /* ignore */ }
          }
        }
        if (a.sla.level !== "overdue") toastedOverdue.delete(a.id);
      }
    }
    firstRunRef.current = false;
    prevLevelsRef.current = new Map(computedAll.map((a) => [a.id, a.sla.level]));

    const filtered = computedAll
      .filter((l) => {
        // hide snoozed unless just contacted
        if (l.snoozedUntil && l.snoozedUntil > now && !l.recent) return false;
        return l.sla.level !== "ok" || l.recent;
      })
      .sort((a, b) => {
        if (a.recent !== b.recent) return a.recent ? -1 : 1;
        const order = { overdue: 0, warning: 1, ok: 2 } as const;
        if (order[a.sla.level] !== order[b.sla.level]) return order[a.sla.level] - order[b.sla.level];
        return (b.sla.daysSinceLast ?? 0) - (a.sla.daysSinceLast ?? 0);
      });
    setAlerts(filtered);
    setLoading(false);
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await migrateLegacySnoozes(userId);
      await loadSnoozes();
      load();
    })();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [userId, load, loadSnoozes, snoozeTick]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("lead-alerts-interactions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "interactions" },
        (payload) => {
          const row = payload.new as { lead_id: string | null };
          if (row?.lead_id) markRecent(row.lead_id);
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load, markRecent]);

  return { alerts, loading, reload: load, markRecent, snooze, unsnooze, followupsToday };
}
