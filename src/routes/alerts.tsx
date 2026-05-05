import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  AlertTriangle, AlertCircle, CalendarX, CheckCircle2, Phone, MessageSquare, Mail,
  Users as UsersIcon, MoreHorizontal, BellOff, Search, Target, RotateCcw, Bell, BellRing,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useLeadAlerts, type LeadAlert } from "@/lib/useLeadAlerts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/alerts")({
  component: () => (
    <AuthGate>
      <AppShell>
        <AlertsPage />
      </AppShell>
    </AuthGate>
  ),
});

const STATUSES = ["novo", "qualificado", "cotacao", "proposta"] as const;

function buildWhatsappLink(phone: string | null, name: string) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, "");
  if (!clean) return null;
  const text = `Olá ${name.split(" ")[0]}, tudo bem? Passando para retomar nossa conversa. Posso te ajudar com alguma informação?`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function buildMailtoLink(email: string | null, name: string) {
  if (!email) return null;
  const subject = encodeURIComponent("Retomando nossa conversa");
  const body = encodeURIComponent(`Olá ${name.split(" ")[0]},\n\nEspero que esteja bem. Quero retomar nosso atendimento e entender como posso te ajudar nos próximos passos.`);
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

function AlertsPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const { alerts, loading, reload, snooze, followupsToday } = useLeadAlerts(user?.id, isAdmin);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [goal, setGoal] = useState<number>(10);
  const [history, setHistory] = useState<{ date: string; count: number }[]>([]);

  // Load goal from profile + 7-day history
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("daily_followup_goal")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data?.daily_followup_goal) setGoal(data.daily_followup_goal);

      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const { data: ints } = await supabase
        .from("interactions")
        .select("occurred_at")
        .eq("created_by", user.id)
        .gte("occurred_at", since.toISOString());
      const counts = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        counts.set(d.toISOString().slice(0, 10), 0);
      }
      for (const it of (ints ?? []) as { occurred_at: string }[]) {
        const key = new Date(it.occurred_at).toISOString().slice(0, 10);
        if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (!cancelled) {
        setHistory(Array.from(counts.entries()).map(([date, count]) => ({ date, count })));
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, followupsToday]);

  const updateGoal = async (next: number) => {
    setGoal(next);
    if (!user?.id) return;
    await supabase.from("profiles").update({ daily_followup_goal: next }).eq("user_id", user.id);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (term && !a.name.toLowerCase().includes(term)) return false;
      if (stageFilter !== "all" && a.status !== stageFilter) return false;
      if (onlyMine && user?.id && a.assigned_to !== user.id && a.created_by !== user.id) return false;
      return true;
    });
  }, [alerts, search, stageFilter, onlyMine, user?.id]);

  const justContacted = filtered.filter((a) => a.recent && a.sla.level === "ok");
  const overdue = filtered.filter((a) => a.sla.level === "overdue");
  const warning = filtered.filter((a) => a.sla.level === "warning");
  const goalPct = Math.min(100, Math.round((followupsToday / goal) * 100));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("alertsTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("alertsSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          {loading ? t("loading") : t("alertsRefresh")}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-destructive/30">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              {t("slaOverdue")}
            </div>
            <div className="text-2xl font-bold text-destructive">{overdue.length}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              {t("slaAtRisk")}
            </div>
            <div className="text-2xl font-bold text-amber-600">{warning.length}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {t("alertsToday")}
            </div>
            <div className="text-2xl font-bold text-emerald-700">{followupsToday}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                {t("alertsGoal")}
              </div>
              <Input
                type="number"
                min={1}
                value={goal}
                onChange={(e) => updateGoal(Math.max(1, Number(e.target.value) || 1))}
                className="h-6 w-14 text-xs px-1.5"
              />
            </div>
            <Progress value={goalPct} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {t("alertsGoalProgress").replace("{n}", String(followupsToday)).replace("{total}", String(goal))}
            </div>
            {history.length > 0 && (
              <div className="pt-1">
                <div className="flex items-end gap-1 h-8">
                  {history.map((d) => {
                    const pct = Math.min(100, (d.count / goal) * 100);
                    const reached = d.count >= goal;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.count}`}>
                        <div className="w-full bg-muted rounded-sm relative h-6 flex items-end">
                          <div
                            className={cn("w-full rounded-sm", reached ? "bg-emerald-500" : "bg-primary/60")}
                            style={{ height: `${Math.max(8, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 text-center">{t("alertsLast7Days")}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("alertsSearch")}
            className="pl-8 h-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("alertsFilterAll")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
            <Label htmlFor="only-mine" className="text-sm cursor-pointer">{t("alertsOnlyMine")}</Label>
          </div>
        )}
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
            <AlertList items={justContacted} empty="" onSnooze={snooze} />
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
            <AlertList items={overdue} empty={search || stageFilter !== "all" ? t("alertsNoMatches") : t("alertsNoOverdue")} onSnooze={snooze} />
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
            <AlertList items={warning} empty={search || stageFilter !== "all" ? t("alertsNoMatches") : t("alertsNoWarning")} onSnooze={snooze} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AlertList({
  items,
  empty,
  onSnooze,
}: {
  items: LeadAlert[];
  empty: string;
  onSnooze: (leadId: string, hours: number) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y">
      {items.map((a) => {
        const wa = buildWhatsappLink(a.phone, a.name);
        const mail = buildMailtoLink(a.email, a.name);
        const tomorrowHours = (() => {
          const d = new Date();
          d.setHours(9, 0, 0, 0);
          d.setDate(d.getDate() + 1);
          return Math.max(1, Math.round((d.getTime() - Date.now()) / 3600_000));
        })();
        return (
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
            <div className="flex items-center gap-1">
              <Button
                asChild
                size="sm"
                variant={a.recent ? "outline" : a.sla.level === "overdue" ? "destructive" : "default"}
                className={cn(a.recent && "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10")}
              >
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: a.id }}
                  search={{ quickContact: "ligacao" }}
                >
                  <Phone className="h-3.5 w-3.5 mr-1.5" />
                  {a.recent ? t("alertsLogAgain") : t("addInteraction")}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t("addInteraction")}</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/leads/$leadId" params={{ leadId: a.id }} search={{ quickContact: "ligacao" }}>
                      <Phone className="h-4 w-4 mr-2" />{t("alertsChannelCall")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!wa}
                    onClick={() => { if (wa) window.open(wa, "_blank"); }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />{t("alertsChannelWhatsapp")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!mail}
                    onClick={() => { if (mail) window.location.href = mail; }}
                  >
                    <Mail className="h-4 w-4 mr-2" />{t("alertsChannelEmail")}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/leads/$leadId" params={{ leadId: a.id }} search={{ quickContact: "reuniao" }}>
                      <UsersIcon className="h-4 w-4 mr-2" />{t("alertsChannelMeeting")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-1.5">
                    <BellOff className="h-3.5 w-3.5" />{t("alertsSnooze")}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onSnooze(a.id, 2)}>
                    <RotateCcw className="h-4 w-4 mr-2" />{t("alertsSnooze2h")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSnooze(a.id, 24)}>
                    <RotateCcw className="h-4 w-4 mr-2" />{t("alertsSnooze24h")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSnooze(a.id, tomorrowHours)}>
                    <RotateCcw className="h-4 w-4 mr-2" />{t("alertsSnoozeTomorrow")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
