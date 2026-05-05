import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, AlertCircle, Users, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LEAD_SLA_DAYS } from "@/lib/leadSla";

export const Route = createFileRoute("/alerts/sla")({
  component: () => (
    <AuthGate>
      <AppShell>
        <SlaPanel />
      </AppShell>
    </AuthGate>
  ),
});

const STAGES = ["novo", "qualificado", "cotacao", "proposta"] as const;

type LeadRow = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
};
type InteractionRow = { lead_id: string | null; created_by: string | null; occurred_at: string };
type ProfileRow = { user_id: string; full_name: string | null; daily_followup_goal: number | null };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function SlaPanel() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [interactions, setInteractions] = useState<InteractionRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [goalInteractions, setGoalInteractions] = useState<InteractionRow[]>([]);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/alerts" });
  }, [authLoading, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    const since = new Date();
    since.setDate(since.getDate() - Number(period));
    since.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    setLoading(true);
    (async () => {
      const [{ data: ld }, { data: pf }] = await Promise.all([
        supabase
          .from("leads")
          .select("id,status,created_at,created_by,assigned_to")
          .gte("created_at", since.toISOString()),
        supabase.from("profiles").select("user_id,full_name,daily_followup_goal"),
      ]);
      const leadsRows = (ld ?? []) as LeadRow[];
      setLeads(leadsRows);
      const profMap = new Map<string, ProfileRow>();
      for (const p of (pf ?? []) as ProfileRow[]) profMap.set(p.user_id, p);
      setProfiles(profMap);

      const ids = leadsRows.map((l) => l.id);
      let ints: InteractionRow[] = [];
      if (ids.length > 0) {
        const { data: i } = await supabase
          .from("interactions")
          .select("lead_id,created_by,occurred_at")
          .in("lead_id", ids)
          .order("occurred_at", { ascending: true });
        ints = (i ?? []) as InteractionRow[];
      }
      setInteractions(ints);

      // Goal ranking — last 7 days, all interactions per user
      const { data: gi } = await supabase
        .from("interactions")
        .select("lead_id,created_by,occurred_at")
        .gte("occurred_at", sevenDaysAgo.toISOString());
      setGoalInteractions((gi ?? []) as InteractionRow[]);
      setLoading(false);
    })();
  }, [isAdmin, period]);

  // First contact stats per lead
  const firstContactByLead = useMemo(() => {
    const map = new Map<string, InteractionRow>();
    for (const it of interactions) {
      if (it.lead_id && !map.has(it.lead_id)) map.set(it.lead_id, it);
    }
    return map;
  }, [interactions]);

  // Top-level metrics
  const totalLeads = leads.length;
  const firstContactHours: number[] = [];
  let breachCount = 0;
  for (const l of leads) {
    const first = firstContactByLead.get(l.id);
    if (first) {
      const h = (new Date(first.occurred_at).getTime() - new Date(l.created_at).getTime()) / 3600000;
      if (h >= 0) firstContactHours.push(h);
    }
    const threshold = LEAD_SLA_DAYS[l.status] ?? 7;
    const ref = first ? new Date(first.occurred_at).getTime() : new Date(l.created_at).getTime();
    const days = (Date.now() - ref) / 86400000;
    if (days > threshold) breachCount++;
  }
  const avgFirstContact = firstContactHours.length
    ? firstContactHours.reduce((a, b) => a + b, 0) / firstContactHours.length
    : 0;
  const totalInteractions = interactions.length;
  const breachRate = totalLeads ? Math.round((breachCount / totalLeads) * 100) : 0;

  // Per seller table
  const sellerStats = useMemo(() => {
    const map = new Map<string, { hours: number[]; leadCount: number }>();
    for (const l of leads) {
      const owner = l.assigned_to ?? l.created_by;
      if (!owner) continue;
      const entry = map.get(owner) ?? { hours: [], leadCount: 0 };
      entry.leadCount++;
      const first = firstContactByLead.get(l.id);
      if (first) {
        const h = (new Date(first.occurred_at).getTime() - new Date(l.created_at).getTime()) / 3600000;
        if (h >= 0) entry.hours.push(h);
      }
      map.set(owner, entry);
    }
    return Array.from(map.entries())
      .map(([userId, v]) => ({
        userId,
        name: profiles.get(userId)?.full_name ?? userId.slice(0, 8),
        leadCount: v.leadCount,
        avg: v.hours.length ? v.hours.reduce((a, b) => a + b, 0) / v.hours.length : null,
        median: v.hours.length ? median(v.hours) : null,
      }))
      .sort((a, b) => b.leadCount - a.leadCount);
  }, [leads, firstContactByLead, profiles]);

  // Per stage breach
  const stageStats = useMemo(() => {
    return STAGES.map((stage) => {
      const inStage = leads.filter((l) => l.status === stage);
      let breaches = 0;
      for (const l of inStage) {
        const first = firstContactByLead.get(l.id);
        const threshold = LEAD_SLA_DAYS[stage] ?? 7;
        const ref = first ? new Date(first.occurred_at).getTime() : new Date(l.created_at).getTime();
        const days = (Date.now() - ref) / 86400000;
        if (days > threshold) breaches++;
      }
      return { stage, total: inStage.length, breaches, pct: inStage.length ? Math.round((breaches / inStage.length) * 100) : 0 };
    });
  }, [leads, firstContactByLead]);

  // Goal ranking — last 7 days
  const goalRanking = useMemo(() => {
    const byUser = new Map<string, Map<string, number>>();
    for (const it of goalInteractions) {
      if (!it.created_by) continue;
      const day = new Date(it.occurred_at).toISOString().slice(0, 10);
      const days = byUser.get(it.created_by) ?? new Map<string, number>();
      days.set(day, (days.get(day) ?? 0) + 1);
      byUser.set(it.created_by, days);
    }
    return Array.from(byUser.entries())
      .map(([userId, days]) => {
        const goal = profiles.get(userId)?.daily_followup_goal ?? 10;
        const counts = Array.from(days.values());
        const avgPct = counts.length
          ? counts.reduce((a, b) => a + Math.min(100, (b / goal) * 100), 0) / 7
          : 0;
        return {
          userId,
          name: profiles.get(userId)?.full_name ?? userId.slice(0, 8),
          goal,
          avgPct: Math.round(avgPct),
          activeDays: counts.length,
        };
      })
      .sort((a, b) => b.avgPct - a.avgPct)
      .slice(0, 10);
  }, [goalInteractions, profiles]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/alerts"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{t("slaPanelTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("slaPanelSubtitle")}</p>
          </div>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as "7" | "30" | "90")}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("slaPeriod7")}</SelectItem>
            <SelectItem value="30">{t("slaPeriod30")}</SelectItem>
            <SelectItem value="90">{t("slaPeriod90")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top metrics */}
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={<Users className="h-4 w-4" />} label={t("slaLeadsCount")} value={String(totalLeads)} />
        <MetricCard icon={<AlertCircle className="h-4 w-4 text-destructive" />} label={t("slaBreachRate")} value={`${breachRate}%`} accent="destructive" />
        <MetricCard icon={<Clock className="h-4 w-4" />} label={t("slaAvgFirstContact")} value={avgFirstContact ? `${avgFirstContact.toFixed(1)}h` : "—"} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label={t("slaInteractionsCount")} value={String(totalInteractions)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* By seller */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("slaBySellerTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</div>
            ) : sellerStats.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">—</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("slaSeller")}</TableHead>
                    <TableHead className="text-right">{t("slaLeadsCount")}</TableHead>
                    <TableHead className="text-right">{t("slaAvg")}</TableHead>
                    <TableHead className="text-right">{t("slaMedian")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellerStats.map((s) => (
                    <TableRow key={s.userId}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.leadCount}</TableCell>
                      <TableCell className="text-right">{s.avg !== null ? `${s.avg.toFixed(1)}h` : "—"}</TableCell>
                      <TableCell className="text-right">{s.median !== null ? `${s.median.toFixed(1)}h` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* By stage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("slaByStageTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageStats.map((s) => (
              <div key={s.stage} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="capitalize font-medium">{s.stage}</span>
                  <span className="text-muted-foreground">{s.breaches}/{s.total} · {s.pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Goal ranking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("slaGoalRankingTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {goalRanking.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">—</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("slaSeller")}</TableHead>
                  <TableHead className="text-right">{t("alertsGoal")}</TableHead>
                  <TableHead className="text-right">{t("slaGoalAvgPct")}</TableHead>
                  <TableHead className="w-[40%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {goalRanking.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{r.goal}</TableCell>
                    <TableCell className="text-right font-medium">{r.avgPct}%</TableCell>
                    <TableCell>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={r.avgPct >= 100 ? "h-full bg-emerald-500" : "h-full bg-primary/60"}
                          style={{ width: `${Math.min(100, r.avgPct)}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "destructive";
}) {
  return (
    <Card className={accent === "destructive" ? "border-destructive/30" : undefined}>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
        <div className={`text-2xl font-bold ${accent === "destructive" ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
