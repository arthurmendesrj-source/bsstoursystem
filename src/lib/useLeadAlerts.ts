import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeLeadSla, type LeadSlaInfo } from "@/lib/leadSla";

export type LeadAlert = {
  id: string;
  name: string;
  status: string;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
  assigned_to: string | null;
  created_by: string | null;
  lastInteractionAt: string | null;
  lastInteractionType: string | null;
  recent: boolean; // contact logged in the last 60s
  sla: LeadSlaInfo;
};

const RECENT_MS = 60_000;

export function useLeadAlerts(userId: string | null | undefined, isAdmin: boolean) {
  const [alerts, setAlerts] = useState<LeadAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const recentRef = useRef<Map<string, number>>(new Map());

  const markRecent = useCallback((leadId: string) => {
    recentRef.current.set(leadId, Date.now());
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    let q = supabase
      .from("leads")
      .select("id,name,status,next_action,next_action_date,updated_at,assigned_to,created_by")
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
    const now = Date.now();
    const computed: LeadAlert[] = (leads ?? [])
      .map((l) => {
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
          sla,
        } as LeadAlert;
      })
      // keep alerts that are not ok OR were just contacted (so the user sees the
      // status drop in real time before they disappear from the feed)
      .filter((l) => l.sla.level !== "ok" || l.recent)
      .sort((a, b) => {
        if (a.recent !== b.recent) return a.recent ? -1 : 1;
        const order = { overdue: 0, warning: 1, ok: 2 } as const;
        if (order[a.sla.level] !== order[b.sla.level]) return order[a.sla.level] - order[b.sla.level];
        return (b.sla.daysSinceLast ?? 0) - (a.sla.daysSinceLast ?? 0);
      });
    setAlerts(computed);
    setLoading(false);
  }, [userId, isAdmin]);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  // Realtime: when a new interaction lands, mark its lead as "recent" and refresh
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

  return { alerts, loading, reload: load, markRecent };
}
