import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Users, TrendingUp, Mail, ListChecks, AlertCircle, ChevronRight } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth, type AppRole } from "@/lib/auth";
import { useViewAs } from "@/lib/viewAs";
import { useSubordinates } from "@/lib/hierarchy";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/gerencial")({
  component: () => (
    <AuthGate>
      <AppShell>
        <GerencialPage />
      </AppShell>
    </AuthGate>
  ),
});

type Period = "7" | "30" | "90" | "all";

type UserStats = {
  user_id: string;
  full_name: string;
  role: AppRole;
  leadsActive: number;
  leadsClosed: number;
  leadsLost: number;
  revenue: number;
  tasksPending: number;
  tasksOverdue: number;
  emailsUnread: number;
};

const FUNNEL_KEYS = ["novo", "qualificado", "cotacao", "proposta", "fechado", "perdido"] as const;

function GerencialPage() {
  const { user, isAdmin, hasRole, loading: authLoading } = useAuth();
  const { enterViewAs } = useViewAs();
  const { subordinates, loading: subLoading } = useSubordinates();
  const { format } = useCurrency();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>("30");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<UserStats[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const allowed = isAdmin || hasRole("diretor") || hasRole("gerente");

  useEffect(() => {
    if (!authLoading && !allowed) navigate({ to: "/dashboard" });
  }, [authLoading, allowed, navigate]);

  const userIds = useMemo(() => subordinates.map((s) => s.user_id), [subordinates]);

  useEffect(() => {
    if (!user || subLoading || userIds.length === 0) {
      setStats([]); setFunnel({}); setLoading(false);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      const sinceISO = period === "all"
        ? null
        : new Date(Date.now() - Number(period) * 24 * 3600 * 1000).toISOString();

      const leadsQ = supabase.from("leads").select("id,assigned_to,created_by,status,estimated_value,currency,created_at,next_action_date,updated_at").in("assigned_to", userIds);
      const tasksQ = supabase.from("tasks").select("id,assigned_to,completed,due_date,created_at").in("assigned_to", userIds);
      const bookingsQ = supabase.from("bookings").select("created_by,total_amount,status,created_at").in("created_by", userIds).eq("status", "confirmada");
      const emailsQ = Promise.resolve({ data: [] as Array<{ id: string; is_unread: boolean | null; lead_id: string | null; received_at: string | null }> });

      const [{ data: leads }, { data: tasks }, { data: bookings }, { data: emails }] =
        await Promise.all([leadsQ, tasksQ, bookingsQ, emailsQ]);
      if (cancel) return;

      const leadOwner = new Map<string, string>();
      const leadsArr = leads ?? [];
      const tasksArr = tasks ?? [];
      const bookingsArr = bookings ?? [];

      const inPeriod = (iso: string | null) => !sinceISO || (iso && iso >= sinceISO);

      const funnelAgg: Record<string, number> = {};
      FUNNEL_KEYS.forEach((k) => (funnelAgg[k] = 0));

      const byUser = new Map<string, UserStats>();
      subordinates.forEach((s) => {
        byUser.set(s.user_id, {
          user_id: s.user_id, full_name: s.full_name, role: s.role,
          leadsActive: 0, leadsClosed: 0, leadsLost: 0, revenue: 0,
          tasksPending: 0, tasksOverdue: 0, emailsUnread: 0,
        });
      });

      leadsArr.forEach((l: any) => {
        leadOwner.set(l.id, l.assigned_to);
        const s = byUser.get(l.assigned_to);
        if (!s) return;
        if (!inPeriod(l.created_at)) return;
        if (l.status === "fechado") s.leadsClosed += 1;
        else if (l.status === "perdido") s.leadsLost += 1;
        else s.leadsActive += 1;
        if (FUNNEL_KEYS.includes(l.status)) funnelAgg[l.status] += 1;
      });

      const now = Date.now();
      tasksArr.forEach((t: any) => {
        const s = byUser.get(t.assigned_to);
        if (!s) return;
        if (!inPeriod(t.created_at)) return;
        if (!t.completed) {
          s.tasksPending += 1;
          if (t.due_date && new Date(t.due_date).getTime() < now) s.tasksOverdue += 1;
        }
      });

      bookingsArr.forEach((b: any) => {
        const s = byUser.get(b.created_by);
        if (!s) return;
        if (!inPeriod(b.created_at)) return;
        s.revenue += Number(b.total_amount || 0);
      });

      (emails ?? []).forEach((e: any) => {
        if (!e.is_unread || !e.lead_id) return;
        const owner = leadOwner.get(e.lead_id);
        if (!owner) return;
        const s = byUser.get(owner);
        if (!s) return;
        if (!inPeriod(e.received_at)) return;
        s.emailsUnread += 1;
      });

      setStats(Array.from(byUser.values()));
      setFunnel(funnelAgg);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user?.id, subLoading, userIds.join(","), period]);

  const filtered = useMemo(() => {
    return stats.filter((s) => {
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (search && !s.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.revenue - a.revenue || b.leadsClosed - a.leadsClosed);
  }, [stats, roleFilter, search]);

  const totals = useMemo(() => filtered.reduce((acc, s) => ({
    leadsActive: acc.leadsActive + s.leadsActive,
    leadsClosed: acc.leadsClosed + s.leadsClosed,
    leadsLost: acc.leadsLost + s.leadsLost,
    revenue: acc.revenue + s.revenue,
    tasksPending: acc.tasksPending + s.tasksPending,
    tasksOverdue: acc.tasksOverdue + s.tasksOverdue,
    emailsUnread: acc.emailsUnread + s.emailsUnread,
  }), { leadsActive: 0, leadsClosed: 0, leadsLost: 0, revenue: 0, tasksPending: 0, tasksOverdue: 0, emailsUnread: 0 }), [filtered]);

  const conversion = totals.leadsClosed + totals.leadsLost > 0
    ? Math.round((totals.leadsClosed / (totals.leadsClosed + totals.leadsLost)) * 100)
    : 0;

  if (!allowed) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gerencial</h1>
        <p className="text-muted-foreground">Consulta de desempenho dos seus subordinados</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Período</label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Papel</label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="diretor">Diretor</SelectItem>
              <SelectItem value="gerente">Gerente</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="operador">Operador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome…" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Usuários" value={String(filtered.length)} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Leads ativos" value={String(totals.leadsActive)} sub={`${totals.leadsClosed} fechados · ${conversion}% conv.`} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Receita confirmada" value={format(totals.revenue, "BRL")} />
        <KpiCard icon={<ListChecks className="h-4 w-4" />} label="Tarefas" value={`${totals.tasksPending} pend.`} sub={`${totals.tasksOverdue} vencidas`} />
        <KpiCard icon={<Mail className="h-4 w-4" />} label="E-mails não lidos" value={String(totals.emailsUnread)} />
        <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Leads perdidos" value={String(totals.leadsLost)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Funil consolidado</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {FUNNEL_KEYS.map((k) => (
              <div key={k} className="rounded-md border bg-muted/30 p-3 text-center">
                <div className="text-xs text-muted-foreground capitalize">{k}</div>
                <div className="text-2xl font-bold">{funnel[k] ?? 0}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ranking de usuários</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="text-right">Leads ativos</TableHead>
                <TableHead className="text-right">Fechados</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Tarefas pend.</TableHead>
                <TableHead className="text-right">Vencidas</TableHead>
                <TableHead className="text-right">E-mails</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Sem usuários</TableCell></TableRow>
              )}
              {filtered.map((s) => (
                <TableRow
                  key={s.user_id}
                  className="cursor-pointer"
                  onClick={() => {
                    enterViewAs({ user_id: s.user_id, full_name: s.full_name, role: s.role });
                    navigate({ to: "/dashboard" });
                  }}
                >
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell><Badge variant="secondary">{s.role}</Badge></TableCell>
                  <TableCell className="text-right">{s.leadsActive}</TableCell>
                  <TableCell className="text-right">{s.leadsClosed}</TableCell>
                  <TableCell className="text-right">{format(s.revenue, "BRL")}</TableCell>
                  <TableCell className="text-right">{s.tasksPending}</TableCell>
                  <TableCell className="text-right">{s.tasksOverdue > 0 ? <span className="text-rose-600">{s.tasksOverdue}</span> : 0}</TableCell>
                  <TableCell className="text-right">{s.emailsUnread}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Link to="/gerencial/$userId" params={{ userId: s.user_id }} className="inline-flex items-center text-primary text-xs">
                      Relatório <ChevronRight className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Apenas consulta — para editar leads, tarefas ou e-mails, acesse os módulos correspondentes.</p>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
