import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserPlus, FileText, CalendarCheck, TrendingUp } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthGate>
      <AppShell>
        <Dashboard />
      </AppShell>
    </AuthGate>
  ),
});

function Dashboard() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [stats, setStats] = useState({ leads: 0, quotes: 0, bookings: 0, revenue: 0 });

  useEffect(() => {
    (async () => {
      const [leads, quotes, bookings, revQ] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).not("status", "in", "(fechado,perdido)"),
        supabase.from("quotes").select("id", { count: "exact", head: true }).in("status", ["rascunho", "enviada"]),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmada"),
        supabase.from("bookings").select("total_amount").eq("status", "confirmada"),
      ]);
      const revenue = (revQ.data ?? []).reduce((sum, b: { total_amount: number }) => sum + Number(b.total_amount || 0), 0);
      setStats({
        leads: leads.count ?? 0,
        quotes: quotes.count ?? 0,
        bookings: bookings.count ?? 0,
        revenue,
      });
    })();
  }, []);

  const cards = [
    { label: t("totalLeads"), value: stats.leads, icon: UserPlus, color: "text-blue-600" },
    { label: t("openQuotes"), value: stats.quotes, icon: FileText, color: "text-amber-600" },
    { label: t("confirmedBookings"), value: stats.bookings, icon: CalendarCheck, color: "text-emerald-600" },
    { label: t("expectedRevenue"), value: format(stats.revenue, "BRL"), icon: TrendingUp, color: "text-violet-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
        <p className="text-muted-foreground">{t("welcome")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
}
