import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { useViewAs } from "@/lib/viewAs";
import { supabase } from "@/integrations/supabase/client";
import { computeLeadSla, type LeadSlaInfo } from "@/lib/leadSla";
import { toast } from "sonner";

export const Route = createFileRoute("/funnel")({
  component: () => (
    <AuthGate>
      <AppShell>
        <FunnelPage />
      </AppShell>
    </AuthGate>
  ),
});

type Lead = {
  id: string;
  name: string;
  destination: string | null;
  estimated_value: number | null;
  currency: string;
  status: string;
  updated_at: string | null;
  next_action_date: string | null;
};

const COLUMNS = [
  { key: "novo", label: "Novo", color: "border-slate-400" },
  { key: "qualificado", label: "Qualificado", color: "border-blue-400" },
  { key: "cotacao", label: "Cotação", color: "border-amber-400" },
  { key: "proposta", label: "Proposta", color: "border-violet-400" },
  { key: "fechado", label: "Fechado", color: "border-emerald-500" },
  { key: "perdido", label: "Perdido", color: "border-red-400" },
];

type Filter = "all" | "risk" | "overdue";

function FunnelPage() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { viewAs } = useViewAs();
  const targetUserId = viewAs?.user_id ?? null;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lastByLead, setLastByLead] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    let q = supabase
      .from("leads")
      .select("id,name,destination,estimated_value,currency,status,updated_at,next_action_date");
    if (targetUserId) q = q.eq("assigned_to", targetUserId);
    const { data } = await q;
    setLeads((data as Lead[]) ?? []);
    const { data: ints } = await supabase
      .from("interactions")
      .select("lead_id, occurred_at")
      .order("occurred_at", { ascending: false });
    const map: Record<string, string> = {};
    (ints ?? []).forEach((i: { lead_id: string | null; occurred_at: string }) => {
      if (i.lead_id && !map[i.lead_id]) map[i.lead_id] = i.occurred_at;
    });
    setLastByLead(map);
  };

  useEffect(() => {
    load();
  }, [targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const slaByLead = useMemo(() => {
    const m: Record<string, LeadSlaInfo> = {};
    leads.forEach((l) => {
      m[l.id] = computeLeadSla({
        status: l.status,
        updated_at: l.updated_at,
        next_action_date: l.next_action_date,
        lastInteractionAt: lastByLead[l.id] ?? null,
      });
    });
    return m;
  }, [leads, lastByLead]);

  const visibleLeads = useMemo(() => {
    if (filter === "all") return leads;
    return leads.filter((l) => {
      const s = slaByLead[l.id]?.level;
      return filter === "overdue" ? s === "overdue" : s === "warning" || s === "overdue";
    });
  }, [leads, slaByLead, filter]);

  const onDrop = async (status: string) => {
    if (!dragId) return;
    const { error } = await supabase.from("leads").update({ status: status as "novo" }).eq("id", dragId);
    if (error) toast.error(error.message);
    else setLeads((cur) => cur.map((l) => (l.id === dragId ? { ...l, status } : l)));
    setDragId(null);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("funnel")}</h1>
            <p className="text-muted-foreground">Drag & drop</p>
          </div>
          <div className="flex gap-1 rounded-md border p-1 bg-muted/30">
            {(["all", "risk", "overdue"] as Filter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setFilter(f)}
              >
                {t(`slaFilter${f === "all" ? "All" : f === "risk" ? "Risk" : "Overdue"}` as "slaFilterAll")}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const items = visibleLeads.filter((l) => l.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(col.key)}
                className={`flex flex-col rounded-lg border-t-4 ${col.color} bg-muted/30 p-3`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="rounded-full bg-background px-2 text-xs">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((l) => {
                    const sla = slaByLead[l.id];
                    return (
                      <Card
                        key={l.id}
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        className="cursor-move p-3 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link to="/leads/$leadId" params={{ leadId: l.id }} className="text-sm font-medium hover:underline truncate">
                            {l.name}
                          </Link>
                          {sla && sla.level !== "ok" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={sla.level === "overdue" ? "text-rose-600" : "text-amber-600"}>
                                  {sla.level === "overdue" ? <AlertCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {sla.nextActionOverdue && <div>{t("slaNextActionOverdue")}</div>}
                                {sla.daysSinceLast !== null && (
                                  <div>{t("slaDaysIdle").replace("{n}", String(sla.daysSinceLast))}</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {l.destination && <div className="text-xs text-muted-foreground">{l.destination}</div>}
                        {l.estimated_value && (
                          <div className="mt-1 text-xs font-semibold text-primary">
                            {format(Number(l.estimated_value), l.currency as "BRL")}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
