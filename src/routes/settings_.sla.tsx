import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Save, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_SLA_HOURS, invalidateSlaSettingsCache } from "@/lib/leadSla";

export const Route = createFileRoute("/settings_/sla")({
  component: () => (
    <AuthGate>
      <AppShell>
        <SlaSettingsPage />
      </AppShell>
    </AuthGate>
  ),
});

const STAGES = ["novo", "qualificado", "cotacao", "proposta"] as const;

type Row = { stage: string; warning_hours: number; overdue_hours: number };

function SlaSettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { navigate({ to: "/alerts" }); return; }
    (async () => {
      const { data } = await supabase
        .from("sla_settings")
        .select("stage,warning_hours,overdue_hours");
      const map: Record<string, Row> = {};
      for (const s of STAGES) {
        const found = (data ?? []).find((r) => r.stage === s);
        map[s] = found
          ? (found as Row)
          : { stage: s, warning_hours: DEFAULT_SLA_HOURS[s].warning, overdue_hours: DEFAULT_SLA_HOURS[s].overdue };
      }
      setRows(map);
      setLoading(false);
    })();
  }, [isAdmin, authLoading, navigate]);

  const update = (stage: string, field: "warning_hours" | "overdue_hours", value: number) => {
    setRows((prev) => ({ ...prev, [stage]: { ...prev[stage], [field]: Math.max(1, value) } }));
  };

  const restoreDefaults = () => {
    const map: Record<string, Row> = {};
    for (const s of STAGES) {
      const d = DEFAULT_SLA_HOURS[s];
      map[s] = { stage: s, warning_hours: d.warning, overdue_hours: d.overdue };
    }
    setRows(map);
  };

  const save = async () => {
    setSaving(true);
    const payload = Object.values(rows).map((r) => ({
      stage: r.stage as "novo" | "qualificado" | "cotacao" | "proposta",
      warning_hours: r.warning_hours,
      overdue_hours: r.overdue_hours,
    }));
    const { error } = await supabase.from("sla_settings").upsert(payload, { onConflict: "stage" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidateSlaSettingsCache();
    toast.success(t("slaSettingsSaved"));
  };

  if (loading) return <div className="text-sm text-muted-foreground">…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings"><ArrowLeft className="h-4 w-4 mr-1" />{t("settings")}</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{t("slaSettingsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("slaSettingsSubtitle")}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("slaStage")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("slaStage")}</TableHead>
                <TableHead className="w-40">{t("slaWarningHours")}</TableHead>
                <TableHead className="w-40">{t("slaOverdueHours")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STAGES.map((s) => (
                <TableRow key={s}>
                  <TableCell className="capitalize font-medium">{s}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={rows[s]?.warning_hours ?? 0}
                      onChange={(e) => update(s, "warning_hours", Number(e.target.value) || 1)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={rows[s]?.overdue_hours ?? 0}
                      onChange={(e) => update(s, "overdue_hours", Number(e.target.value) || 1)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {t("slaSave")}
        </Button>
        <Button variant="outline" onClick={restoreDefaults}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          {t("slaRestoreDefaults")}
        </Button>
      </div>
    </div>
  );
}
