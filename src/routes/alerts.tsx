import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, AlertCircle, CalendarX, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  const justContacted = alerts.filter((a) => a.recent && a.sla.level === "ok");
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

      {justContacted.length > 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {t("alertsJustContacted")} · {justContacted.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertList items={justContacted} empty="" />
          </CardContent>
        </Card>
      )}

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
        <li
          key={a.id}
          className={cn(
            "py-2.5 flex items-center justify-between gap-3 -mx-2 px-2 rounded transition-colors",
            a.recent && "bg-emerald-500/10",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                to="/leads/$leadId"
                params={{ leadId: a.id }}
                className="font-medium hover:underline truncate"
              >
                {a.name}
              </Link>
              {a.recent && (
                <Badge className="bg-emerald-600 text-white border-transparent gap-1 h-5">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("alertsJustNow")}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
              <Badge variant="outline" className="capitalize">{a.status}</Badge>
              {a.recent && a.lastInteractionAt ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  {t("alertsLastContact")}:
                  {a.lastInteractionType && (
                    <Badge variant="outline" className="capitalize border-emerald-500/40 text-emerald-700 h-5">
                      {a.lastInteractionType}
                    </Badge>
                  )}
                  <span>
                    {new Date(a.lastInteractionAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
              ) : (
                a.sla.daysSinceLast !== null && (
                  <span>{t("slaDaysIdle").replace("{n}", String(a.sla.daysSinceLast))}</span>
                )
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
