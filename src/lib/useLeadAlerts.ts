import { useCallback, useEffect, useState } from "react";
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
  sla: LeadSlaInfo;
};

export function useLeadAlerts(userId: string | null | undefined, isAdmin: boolean) {
  const [alerts, setAlerts] = useState<LeadAlert[]>([]);
  const [loading, setLoading] = useState(false);

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
    let lastByLead = new Map<string, string>();
    if (ids.length > 0) {
      const { data: ints } = await supabase
        .from("interactions")
        .select("lead_id,occurred_at")
        .in("lead_id", ids)
        .order("occurred_at", { ascending: false });
      for (const it of (ints ?? []) as { lead_id: string | null; occurred_at: string }[]) {
        if (it.lead_id && !lastByLead.has(it.lead_id)) lastByLead.set(it.lead_id, it.occurred_at);
      }
    }
    const computed: LeadAlert[] = (leads ?? [])
      .map((l) => {
        const sla = computeLeadSla({
          status: l.status,
          updated_at: l.updated_at,
          next_action_date: l.next_action_date,
          lastInteractionAt: lastByLead.get(l.id) ?? null,
        });
        return { ...l, sla } as LeadAlert;
      })
      .filter((l) => l.sla.level !== "ok")
      .sort((a, b) => {
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

  return { alerts, loading, reload: load };
}
