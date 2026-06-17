import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { listSecurityDefinerFunctions, type SecurityDefinerFn } from "@/lib/security-audit.functions";
import { checkRealtimeSecurity, type RealtimeSecurityReport } from "@/lib/realtime-security.functions";

export const Route = createFileRoute("/security-audit")({
  component: () => (
    <AuthGate>
      <AppShell>
        <SecurityAuditPage />
      </AppShell>
    </AuthGate>
  ),
});

function statusBadge(s: SecurityDefinerFn["status"]) {
  if (s === "ok") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"><ShieldCheck className="h-3 w-3 mr-1" />OK</Badge>;
  if (s === "accepted_risk") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"><ShieldQuestion className="h-3 w-3 mr-1" />Aceito</Badge>;
  return <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"><ShieldAlert className="h-3 w-3 mr-1" />Revisar</Badge>;
}

function SecurityAuditPage() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<SecurityDefinerFn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rt, setRt] = useState<RealtimeSecurityReport | null>(null);
  const [rtError, setRtError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listSecurityDefinerFunctions()
      .then(setRows)
      .catch((e) => setError(e?.message ?? String(e)));
    checkRealtimeSecurity()
      .then(setRt)
      .catch((e) => setRtError(e?.message ?? String(e)));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("adminOnly")}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("secAuditTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("secAuditSubtitle")}</p>
      </div>

      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("secAuditFunctions")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("secAuditFn")}</TableHead>
                <TableHead>{t("secAuditExecutors")}</TableHead>
                <TableHead>{t("secAuditStatus")}</TableHead>
                <TableHead>{t("secAuditWhy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">{t("loading")}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">{t("noData")}</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={`${r.schema}.${r.function_name}.${r.args}`}>
                    <TableCell>
                      <div className="font-mono text-xs">{r.schema}.{r.function_name}</div>
                      {r.args && <div className="font-mono text-[11px] text-muted-foreground">({r.args})</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.executors.map((e) => (
                          <Badge key={e} variant="outline" className="text-[11px]">{e}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md">{r.rationale}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

void redirect; // keep import for future gating
