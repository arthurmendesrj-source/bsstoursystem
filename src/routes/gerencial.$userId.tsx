import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useSubordinates } from "@/lib/hierarchy";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { EmailMailbox } from "@/components/email/EmailMailbox";

export const Route = createFileRoute("/gerencial/$userId")({
  component: () => (
    <AuthGate>
      <AppShell>
        <UserDetailPage />
      </AppShell>
    </AuthGate>
  ),
});

const FUNNEL_KEYS = ["novo", "qualificado", "cotacao", "proposta", "fechado", "perdido"] as const;
const PAGE_SIZE = 25;

type Kpis = {
  leadsActive: number; leadsClosed: number; leadsLost: number;
  revenue: number; tasksPending: number; tasksOverdue: number; emailsUnread: number;
};

function UserDetailPage() {
  const { userId } = Route.useParams();
  const { isAdmin, hasRole, loading: authLoading } = useAuth();
  const { subordinates } = useSubordinates();
  const { format } = useCurrency();
  const navigate = useNavigate();

  const allowed = isAdmin || hasRole("diretor") || hasRole("gerente");
  useEffect(() => {
    if (!authLoading && !allowed) navigate({ to: "/dashboard" });
  }, [authLoading, allowed, navigate]);

  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [kpis, setKpis] = useState<Kpis>({ leadsActive: 0, leadsClosed: 0, leadsLost: 0, revenue: 0, tasksPending: 0, tasksOverdue: 0, emailsUnread: 0 });
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [counts, setCounts] = useState({ leads: 0, tasks: 0, emails: 0 });
  const [aggLoading, setAggLoading] = useState(true);

  const sub = subordinates.find((s) => s.user_id === userId);

  // Aggregates / KPIs / funnel — independent of pagination, count-only queries
  useEffect(() => {
    let cancel = false;
    (async () => {
      setAggLoading(true);
      const nowISO = new Date().toISOString();

      const [
        prof,
        leadsCnt, leadsActiveCnt, leadsClosedCnt, leadsLostCnt,
        bookingsSum,
        tasksCnt, tasksPendingCnt, tasksOverdueCnt,
        // funnel counts
        ...funnelCnts
      ] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
        supabase.from("leads").select("id", { count: "exact", head: true }).or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from("leads").select("id", { count: "exact", head: true }).or(`assigned_to.eq.${userId},created_by.eq.${userId}`).not("status", "in", "(fechado,perdido)"),
        supabase.from("leads").select("id", { count: "exact", head: true }).or(`assigned_to.eq.${userId},created_by.eq.${userId}`).eq("status", "fechado"),
        supabase.from("leads").select("id", { count: "exact", head: true }).or(`assigned_to.eq.${userId},created_by.eq.${userId}`).eq("status", "perdido"),
        supabase.from("bookings").select("total_amount").eq("created_by", userId).eq("status", "confirmada"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("completed", false),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("completed", false).lt("due_date", nowISO),
        ...FUNNEL_KEYS.map((k) =>
          supabase.from("leads").select("id", { count: "exact", head: true }).or(`assigned_to.eq.${userId},created_by.eq.${userId}`).eq("status", k)
        ),
      ]);
      if (cancel) return;

      setProfile(prof.data ?? null);
      const revenue = (bookingsSum.data ?? []).reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);

      const fmap: Record<string, number> = {};
      FUNNEL_KEYS.forEach((k, i) => { fmap[k] = funnelCnts[i].count ?? 0; });
      setFunnel(fmap);

      // Compute total emails count: need lead ids first (cap to 1000 ids — RLS already scopes)
      const { data: idsData } = await supabase.from("leads").select("id").or(`assigned_to.eq.${userId},created_by.eq.${userId}`).limit(1000);
      const ids = (idsData ?? []).map((x: any) => x.id);
      if (cancel) return;
      setLeadIds(ids);

      let emailsCount = 0;
      let emailsUnread = 0;
      if (ids.length > 0) {
        // emails table removed during email rebuild
      }
      if (cancel) return;

      setCounts({ leads: leadsCnt.count ?? 0, tasks: tasksCnt.count ?? 0, emails: emailsCount });
      setKpis({
        leadsActive: leadsActiveCnt.count ?? 0,
        leadsClosed: leadsClosedCnt.count ?? 0,
        leadsLost: leadsLostCnt.count ?? 0,
        revenue,
        tasksPending: tasksPendingCnt.count ?? 0,
        tasksOverdue: tasksOverdueCnt.count ?? 0,
        emailsUnread,
      });
      setAggLoading(false);
    })();
    return () => { cancel = true; };
  }, [userId]);

  if (!allowed) return null;

  const name = profile?.full_name || sub?.full_name || "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/gerencial" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          {sub && <Badge variant="secondary">{sub.role}</Badge>}
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="funnel">Funil</TabsTrigger>
          <TabsTrigger value="leads">Leads ({counts.leads})</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas ({counts.tasks})</TabsTrigger>
          <TabsTrigger value="emails">E-mails ({counts.emails})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Leads ativos" value={kpis.leadsActive} />
            <Kpi label="Leads fechados" value={kpis.leadsClosed} />
            <Kpi label="Leads perdidos" value={kpis.leadsLost} />
            <Kpi label="Receita confirmada" value={format(kpis.revenue, "BRL")} />
            <Kpi label="Tarefas pendentes" value={kpis.tasksPending} />
            <Kpi label="Tarefas vencidas" value={kpis.tasksOverdue} accent={kpis.tasksOverdue > 0} />
            <Kpi label="E-mails não lidos" value={kpis.emailsUnread} />
          </div>
        </TabsContent>

        <TabsContent value="funnel">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {FUNNEL_KEYS.map((k) => (
              <Card key={k}>
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-muted-foreground capitalize">{k}</div>
                  <div className="text-2xl font-bold">{funnel[k] ?? 0}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <LeadsTable userId={userId} total={counts.leads} format={format} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTable userId={userId} total={counts.tasks} />
        </TabsContent>

        <TabsContent value="emails">
          <EmailMailbox targetUserId={userId} targetEmail={null} managerMode managerName={name} />
        </TabsContent>
      </Tabs>

      {aggLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      <p className="text-xs text-muted-foreground">Visão somente leitura.</p>
    </div>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t">
      <span className="text-xs text-muted-foreground">
        Página {page + 1} de {pages} · {total} registros
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LeadsTable({ userId, total, format }: { userId: string; total: number; format: (n: number, c: any) => string }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const from = page * PAGE_SIZE;
      const { data } = await supabase.from("leads")
        .select("id,name,destination,status,estimated_value,currency,next_action_date,updated_at")
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (!cancel) { setRows(data ?? []); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [userId, page]);

  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Nome</TableHead><TableHead>Destino</TableHead>
          <TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead>
          <TableHead>Próx. ação</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
          {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem leads</TableCell></TableRow>}
          {rows.map((l) => (
            <TableRow key={l.id}>
              <TableCell><Link to="/leads/$leadId" params={{ leadId: l.id }} className="hover:underline font-medium">{l.name}</Link></TableCell>
              <TableCell className="text-muted-foreground">{l.destination ?? "—"}</TableCell>
              <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
              <TableCell className="text-right">{l.estimated_value ? format(Number(l.estimated_value), l.currency || "BRL") : "—"}</TableCell>
              <TableCell className="text-xs">{l.next_action_date ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager page={page} total={total} onPage={setPage} />
    </CardContent></Card>
  );
}

function TasksTable({ userId, total }: { userId: string; total: number }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const from = page * PAGE_SIZE;
      const { data } = await supabase.from("tasks")
        .select("id,title,due_date,completed,priority,lead_id")
        .eq("assigned_to", userId)
        .order("due_date", { ascending: false, nullsFirst: false })
        .range(from, from + PAGE_SIZE - 1);
      if (!cancel) { setRows(data ?? []); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [userId, page]);

  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Título</TableHead><TableHead>Prioridade</TableHead>
          <TableHead>Vencimento</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
          {!loading && rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem tarefas</TableCell></TableRow>}
          {rows.map((t) => {
            const overdue = !t.completed && t.due_date && new Date(t.due_date).getTime() < Date.now();
            return (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell><Badge variant="outline">{t.priority}</Badge></TableCell>
                <TableCell className={`text-xs ${overdue ? "text-rose-600 font-medium" : ""}`}>{t.due_date ? new Date(t.due_date).toLocaleString() : "—"}</TableCell>
                <TableCell>{t.completed ? <Badge variant="secondary">Concluída</Badge> : overdue ? <Badge className="bg-rose-100 text-rose-700">Vencida</Badge> : <Badge variant="outline">Pendente</Badge>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Pager page={page} total={total} onPage={setPage} />
    </CardContent></Card>
  );
}

function EmailsTable({ leadIds, total }: { leadIds: string[]; total: number }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const key = leadIds.join(",");
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      if (leadIds.length === 0) { setRows([]); setLoading(false); return; }
      void page;
      if (!cancel) { setRows([]); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [key, page]);

  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>De</TableHead><TableHead>Assunto</TableHead>
          <TableHead>Recebido</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
          {!loading && rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem e-mails vinculados a leads</TableCell></TableRow>}
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-sm">{e.from_name || e.from_email}</TableCell>
              <TableCell className="font-medium truncate max-w-md">{e.subject || "(sem assunto)"}</TableCell>
              <TableCell className="text-xs">{e.received_at ? new Date(e.received_at).toLocaleString() : "—"}</TableCell>
              <TableCell>{e.is_unread ? <Badge>Não lido</Badge> : <Badge variant="secondary">Lido</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager page={page} total={total} onPage={setPage} />
    </CardContent></Card>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${accent ? "text-rose-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
