import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useSubordinates } from "@/lib/hierarchy";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";

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
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const sub = subordinates.find((s) => s.user_id === userId);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [{ data: prof }, { data: l }, { data: t }, { data: b }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
        supabase.from("leads").select("id,name,destination,status,estimated_value,currency,next_action_date,updated_at,created_at").or(`assigned_to.eq.${userId},created_by.eq.${userId}`).order("updated_at", { ascending: false }),
        supabase.from("tasks").select("id,title,due_date,completed,priority,lead_id,created_at").eq("assigned_to", userId).order("due_date", { ascending: false, nullsFirst: false }),
        supabase.from("bookings").select("id,total_amount,status,created_at").eq("created_by", userId),
      ]);
      if (cancel) return;
      setProfile(prof);
      setLeads(l ?? []);
      setTasks(t ?? []);
      setBookings(b ?? []);

      const leadIds = (l ?? []).map((x: any) => x.id);
      if (leadIds.length > 0) {
        const { data: e } = await supabase.from("emails").select("id,subject,from_name,from_email,is_unread,received_at,lead_id")
          .in("lead_id", leadIds).order("received_at", { ascending: false }).limit(200);
        if (!cancel) setEmails(e ?? []);
      } else {
        setEmails([]);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [userId]);

  const kpis = useMemo(() => {
    const active = leads.filter((l) => !["fechado", "perdido"].includes(l.status)).length;
    const closed = leads.filter((l) => l.status === "fechado").length;
    const lost = leads.filter((l) => l.status === "perdido").length;
    const revenue = bookings.filter((b) => b.status === "confirmada").reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const now = Date.now();
    const tasksPending = tasks.filter((t) => !t.completed).length;
    const tasksOverdue = tasks.filter((t) => !t.completed && t.due_date && new Date(t.due_date).getTime() < now).length;
    const emailsUnread = emails.filter((e) => e.is_unread).length;
    return { active, closed, lost, revenue, tasksPending, tasksOverdue, emailsUnread };
  }, [leads, tasks, bookings, emails]);

  const funnel = useMemo(() => {
    const m: Record<string, number> = {};
    FUNNEL_KEYS.forEach((k) => (m[k] = 0));
    leads.forEach((l) => { if (FUNNEL_KEYS.includes(l.status)) m[l.status] += 1; });
    return m;
  }, [leads]);

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
          <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="emails">E-mails ({emails.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Leads ativos" value={kpis.active} />
            <Kpi label="Leads fechados" value={kpis.closed} />
            <Kpi label="Leads perdidos" value={kpis.lost} />
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
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Destino</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead>
                <TableHead>Próx. ação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {leads.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem leads</TableCell></TableRow>}
                {leads.map((l) => (
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
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Prioridade</TableHead>
                <TableHead>Vencimento</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tasks.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem tarefas</TableCell></TableRow>}
                {tasks.map((t) => {
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
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="emails">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>De</TableHead><TableHead>Assunto</TableHead>
                <TableHead>Recebido</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {emails.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem e-mails vinculados a leads</TableCell></TableRow>}
                {emails.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.from_name || e.from_email}</TableCell>
                    <TableCell className="font-medium truncate max-w-md">{e.subject || "(sem assunto)"}</TableCell>
                    <TableCell className="text-xs">{e.received_at ? new Date(e.received_at).toLocaleString() : "—"}</TableCell>
                    <TableCell>{e.is_unread ? <Badge>Não lido</Badge> : <Badge variant="secondary">Lido</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      <p className="text-xs text-muted-foreground">Visão somente leitura.</p>
    </div>
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
