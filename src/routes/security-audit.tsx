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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Realtime channel security</CardTitle>
          {rt && (
            rt.status === "ok"
              ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"><ShieldCheck className="h-3 w-3 mr-1" />Protegido</Badge>
              : <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"><ShieldAlert className="h-3 w-3 mr-1" />Sem proteção</Badge>
          )}
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-sm">
          {rtError && <div className="text-destructive">{rtError}</div>}
          {!rt && !rtError && <div className="text-muted-foreground">Verificando…</div>}
          {rt && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Tabelas publicadas em realtime</div>
                  <div className="text-xl font-semibold">{rt.published_tables.length}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">RLS em realtime.messages</div>
                  <div className="text-xl font-semibold">{rt.realtime_messages_rls_enabled ? "Ativada" : "Desativada"}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Policies em realtime.messages</div>
                  <div className="text-xl font-semibold">{rt.realtime_messages_policy_count}</div>
                </div>
              </div>

              {rt.status === "error" && (
                <div className="rounded border border-rose-500/40 bg-rose-500/5 p-3 text-rose-700 dark:text-rose-300">
                  <div className="font-medium mb-1">Ação necessária</div>
                  <p className="text-xs">
                    Há tabelas publicadas em realtime mas <code>realtime.messages</code> não tem RLS / policy.
                    Qualquer usuário autenticado pode se inscrever em qualquer tópico. Abra o painel do
                    Lovable Cloud → Realtime → Authorization e habilite as policies por canal.
                  </p>
                </div>
              )}

              {rt.published_tables.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Tabelas publicadas</div>
                  <div className="flex flex-wrap gap-1">
                    {rt.published_tables.map((p) => (
                      <Badge key={`${p.schema}.${p.table}`} variant="outline" className="text-[11px] font-mono">
                        {p.schema}.{p.table}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {rt.realtime_messages_policies.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Policies ativas</div>
                  <ul className="text-xs font-mono space-y-1">
                    {rt.realtime_messages_policies.map((p) => (
                      <li key={p.name}>• {p.name} <span className="text-muted-foreground">({p.cmd})</span></li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-[11px] text-muted-foreground">
                Verificado em {new Date(rt.checked_at).toLocaleString()}
              </div>
            </>
          )}
        </CardContent>
      </Card>


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
