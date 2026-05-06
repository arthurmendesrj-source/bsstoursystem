import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserPlus, FileText, CalendarCheck, TrendingUp, AlertCircle } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { useViewAs } from "@/lib/viewAs";
import { supabase } from "@/integrations/supabase/client";
import { computeLeadSla } from "@/lib/leadSla";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthGate>
      <AppShell>
        <Dashboard />
      </AppShell>
    </AuthGate>
  ),
});

type AtRiskLead = {
  id: string;
  name: string;
  status: string;
  daysSinceLast: number | null;
  nextActionOverdue: boolean;
};

function Dashboard() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { viewAs } = useViewAs();
  const targetUserId = viewAs?.user_id ?? null;
  const [stats, setStats] = useState({ leads: 0, quotes: 0, bookings: 0, revenue: 0, atRisk: 0 });
  const [atRisk, setAtRisk] = useState<AtRiskLead[]>([]);

  useEffect(() => {
    (async () => {
      const leadsBase = supabase.from("leads").select("id", { count: "exact", head: true }).not("status", "in", "(fechado,perdido)");
      const quotesBase = supabase.from("quotes").select("id", { count: "exact", head: true }).in("status", ["rascunho", "enviada"]);
      const bookingsBase = supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmada");
      const revBase = supabase.from("bookings").select("total_amount").eq("status", "confirmada");
      const openLeadsBase = supabase.from("leads").select("id,name,status,updated_at,next_action_date").not("status", "in", "(fechado,perdido)");

      const [leads, quotes, bookings, revQ, openLeads, ints] = await Promise.all([
        targetUserId ? leadsBase.eq("assigned_to", targetUserId) : leadsBase,
        targetUserId ? quotesBase.eq("created_by", targetUserId) : quotesBase,
        targetUserId ? bookingsBase.eq("created_by", targetUserId) : bookingsBase,
        targetUserId ? revBase.eq("created_by", targetUserId) : revBase,
        targetUserId ? openLeadsBase.eq("assigned_to", targetUserId) : openLeadsBase,
        supabase.from("interactions").select("lead_id, occurred_at").order("occurred_at", { ascending: false }),
      ]);

      const revenue = (revQ.data ?? []).reduce((sum, b: { total_amount: number }) => sum + Number(b.total_amount || 0), 0);

      const lastByLead: Record<string, string> = {};
      (ints.data ?? []).forEach((i: { lead_id: string | null; occurred_at: string }) => {
        if (i.lead_id && !lastByLead[i.lead_id]) lastByLead[i.lead_id] = i.occurred_at;
      });

      const risk: AtRiskLead[] = [];
      (openLeads.data ?? []).forEach((l: { id: string; name: string; status: string; updated_at: string | null; next_action_date: string | null }) => {
        const sla = computeLeadSla({
          status: l.status,
          updated_at: l.updated_at,
          next_action_date: l.next_action_date,
          lastInteractionAt: lastByLead[l.id] ?? null,
        });
        if (sla.level === "overdue") {
          risk.push({ id: l.id, name: l.name, status: l.status, daysSinceLast: sla.daysSinceLast, nextActionOverdue: sla.nextActionOverdue });
        }
      });
      risk.sort((a, b) => (b.daysSinceLast ?? 0) - (a.daysSinceLast ?? 0));

      setStats({
        leads: leads.count ?? 0,
        quotes: quotes.count ?? 0,
        bookings: bookings.count ?? 0,
        revenue,
        atRisk: risk.length,
      });
      setAtRisk(risk.slice(0, 5));
    })();
  }, []);

  const cards = [
    { label: t("totalLeads"), value: stats.leads, icon: UserPlus, color: "text-blue-600" },
    { label: t("openQuotes"), value: stats.quotes, icon: FileText, color: "text-amber-600" },
    { label: t("confirmedBookings"), value: stats.bookings, icon: CalendarCheck, color: "text-emerald-600" },
    { label: t("expectedRevenue"), value: format(stats.revenue, "BRL"), icon: TrendingUp, color: "text-violet-600" },
    { label: t("dashAtRisk"), value: stats.atRisk, icon: AlertCircle, color: "text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
        <p className="text-muted-foreground">{t("welcome")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <Icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <div className="mt-3 text-3xl font-bold">{c.value}</div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            {t("dashAtRisk")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {atRisk.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("dashAtRiskEmpty")}</div>
          ) : (
            <ul className="divide-y">
              {atRisk.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between gap-2">
                  <Link to="/leads/$leadId" params={{ leadId: l.id }} className="text-sm font-medium hover:underline truncate">
                    {l.name}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[11px] capitalize">{l.status}</Badge>
                    {l.nextActionOverdue && <Badge className="bg-rose-500/15 text-rose-700 border border-rose-500/30 text-[11px]">{t("slaNextActionOverdue")}</Badge>}
                    {l.daysSinceLast !== null && (
                      <span className="text-xs text-muted-foreground">{t("slaDaysIdle").replace("{n}", String(l.daysSinceLast))}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
