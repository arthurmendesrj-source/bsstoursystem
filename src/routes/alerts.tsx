import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, AlertCircle, CalendarX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useLeadAlerts } from "@/lib/useLeadAlerts";

export const Route = createFileRoute("/alerts")({
  component: () => (
    <AuthGate>
      <AppShell>
        <AlertsPage />
      </AppShell>
    </AuthGate>
  ),
});

function AlertsPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const { alerts, loading, reload } = useLeadAlerts(user?.id, isAdmin);

  const overdue = alerts.filter((a) => a.sla.level === "overdue");
  const warning = alerts.filter((a) => a.sla.level === "warning");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("alertsTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("alertsSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          {loading ? t("loading") : t("alertsRefresh")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              {t("slaOverdue")} · {overdue.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertList items={overdue} empty={t("alertsNoOverdue")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("slaAtRisk")} · {warning.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertList items={warning} empty={t("alertsNoWarning")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AlertList({
  items,
  empty,
}: {
  items: ReturnType<typeof useLeadAlerts>["alerts"];
  empty: string;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              to="/leads/$leadId"
              params={{ leadId: a.id }}
              className="font-medium hover:underline truncate block"
            >
              {a.name}
            </Link>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
              <Badge variant="outline" className="capitalize">{a.status}</Badge>
              {a.sla.daysSinceLast !== null && (
                <span>{t("slaDaysIdle").replace("{n}", String(a.sla.daysSinceLast))}</span>
              )}
              {a.sla.nextActionOverdue && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <CalendarX className="h-3 w-3" />
                  {t("slaNextActionOverdue")}
                  {a.next_action_date && ` · ${new Date(a.next_action_date).toLocaleDateString()}`}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
