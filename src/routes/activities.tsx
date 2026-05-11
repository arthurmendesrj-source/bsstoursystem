import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, isAfter, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { Plus, Play, Pause, CheckCircle2, Clock, AlertCircle, Mail, ExternalLink, Trash2, Link2, ChevronsUpDown, Check } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { TaskUpdatesPanel } from "@/components/TaskUpdatesPanel";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useViewAs } from "@/lib/viewAs";
import { useSubordinates } from "@/lib/hierarchy";
import { supabase } from "@/integrations/supabase/client";
import { notifyTaskAssigned } from "@/lib/tasks.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activities")({
  component: () => (
    <AuthGate>
      <AppShell>
        <ActivitiesPage />
      </AppShell>
    </AuthGate>
  ),
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  category: "negocio" | "suporte";
  priority: "baixa" | "media" | "alta";
  source: "manual" | "email" | "lead";
  started_at: string | null;
  completed_at: string | null;
  time_spent_minutes: number | null;
  lead_id: string | null;
  customer_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
};

type LeadLite = { id: string; code: string | null; name: string; destination?: string | null };

function ActivitiesPage() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const { viewAs } = useViewAs();
  const targetUserId = viewAs?.user_id ?? null;
  const { subordinates } = useSubordinates();
  const subordinateIds = useMemo(() => new Set(subordinates.map((s) => s.user_id)), [subordinates]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [leadsMap, setLeadsMap] = useState<Record<string, LeadLite>>({});
  const [allUsers, setAllUsers] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const canEdit = (task: Task) =>
    isAdmin
    || (!!user && task.assigned_to === user.id)
    || (!!task.assigned_to && subordinateIds.has(task.assigned_to));

  // filters
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "done">("open");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "negocio" | "suporte">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "baixa" | "media" | "alta">("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_date: "",
    priority: "media" as "baixa" | "media" | "alta",
    category: "suporte" as "negocio" | "suporte",
    lead_id: "",
    assigned_to: "",
  });
  const [leadOptions, setLeadOptions] = useState<LeadLite[]>([]);

  const loadData = async () => {
    setLoading(true);
    let query = supabase
      .from("tasks")
      .select("id,title,description,due_date,completed,category,priority,source,started_at,completed_at,time_spent_minutes,lead_id,customer_id,assigned_to,created_by")
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (targetUserId) query = query.eq("assigned_to", targetUserId);
    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Task[];
    setTasks(list);
    const leadIds = Array.from(new Set(list.map(t => t.lead_id).filter(Boolean) as string[]));
    if (leadIds.length) {
      const { data: lds } = await supabase.from("leads").select("id,code,name").in("id", leadIds);
      const map: Record<string, LeadLite> = {};
      (lds ?? []).forEach((l) => { map[l.id] = l as LeadLite; });
      setLeadsMap(map);
    } else {
      setLeadsMap({});
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // load all users for the "Atribuir a" select (open to everyone)
  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, full_name")
      .order("full_name", { ascending: true })
      .then(({ data }) => setAllUsers((data ?? []) as { user_id: string; full_name: string | null }[]));
  }, []);

  // link-to-lead dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTargetIds, setLinkTargetIds] = useState<string[]>([]);
  const [linkLeadId, setLinkLeadId] = useState<string>("");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  // load lead options for the dialogs
  useEffect(() => {
    if (!dialogOpen && !linkDialogOpen) return;
    supabase.from("leads").select("id,code,name,destination").order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setLeadOptions((data ?? []) as LeadLite[]));
  }, [dialogOpen, linkDialogOpen]);

  const openLinkDialog = (ids: string[]) => {
    setLinkTargetIds(ids);
    setLinkLeadId("");
    setLinkDialogOpen(true);
  };

  const linkToLead = async () => {
    if (!linkTargetIds.length) return;
    const patch = linkLeadId
      ? { lead_id: linkLeadId, category: "negocio" as const }
      : { lead_id: null, category: "suporte" as const };
    const { error } = await supabase.from("tasks").update(patch).in("id", linkTargetIds);
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setLinkDialogOpen(false);
      clearSelection();
      loadData();
    }
  };

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter === "open" && task.completed) return false;
      if (statusFilter === "done" && !task.completed) return false;
      if (statusFilter === "in_progress" && (!task.started_at || task.completed)) return false;
      if (categoryFilter !== "all" && task.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const lead = task.lead_id ? leadsMap[task.lead_id] : null;
        const hay = `${task.title} ${task.description ?? ""} ${lead?.code ?? ""} ${lead?.name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, categoryFilter, priorityFilter, search, leadsMap]);

  const stats = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const wkStart = startOfWeek(now, { weekStartsOn: 1 });
    const wkEnd = endOfWeek(now, { weekStartsOn: 1 });
    let open = 0, overdue = 0, doneToday = 0, weekMin = 0;
    for (const task of tasks) {
      if (!task.completed) {
        open++;
        if (task.due_date && isAfter(now, new Date(task.due_date))) overdue++;
      }
      if (task.completed && task.completed_at) {
        const c = new Date(task.completed_at);
        if (c >= dayStart && c <= dayEnd) doneToday++;
        if (c >= wkStart && c <= wkEnd) weekMin += task.time_spent_minutes ?? 0;
      }
    }
    return { open, overdue, doneToday, weekMin };
  }, [tasks]);

  const fmtTime = (min: number | null | undefined) => {
    if (!min) return "—";
    if (min < 60) return `${min}${t("minutesShort")}`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}${t("hoursShort")} ${m}${t("minutesShort")}` : `${h}${t("hoursShort")}`;
  };

  const toggleComplete = async (task: Task) => {
    const { error } = await supabase.from("tasks").update({ completed: !task.completed }).eq("id", task.id);
    if (error) toast.error(error.message);
    else loadData();
  };

  const toggleStarted = async (task: Task) => {
    const newStarted = task.started_at ? null : new Date().toISOString();
    const { error } = await supabase.from("tasks").update({ started_at: newStarted }).eq("id", task.id);
    if (error) toast.error(error.message);
    else loadData();
  };

  const removeTask = async (task: Task) => {
    if (!confirm(`${t("delete")}?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message);
    else loadData();
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const bulkUpdate = async (patch: Partial<Task>) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from("tasks").update(patch).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); clearSelection(); loadData(); }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(t("confirmBulkDelete"))) return;
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); clearSelection(); loadData(); }
  };

  const createActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.title.trim()) return;
    const category = form.lead_id ? "negocio" : form.category;
    const source = form.lead_id ? "lead" : "manual";
    const assignedTo = form.assigned_to || targetUserId || user.id;
    const { data: inserted, error } = await supabase.from("tasks").insert({
      title: form.title.slice(0, 200),
      description: form.description || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      priority: form.priority,
      category,
      source,
      lead_id: form.lead_id || null,
      created_by: user.id,
      assigned_to: assignedTo,
    }).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    // Notifica destinatário se for outra pessoa (falha silenciosa)
    if (inserted?.id && assignedTo && assignedTo !== user.id) {
      notifyTaskAssigned({ data: { taskId: inserted.id } }).catch(() => undefined);
    }
    // Auto-link emails by lead's email
    if (form.lead_id) {
      const { data: leadRow } = await supabase
        .from("leads").select("email, customer_id").eq("id", form.lead_id).maybeSingle();
      const leadEmail = (leadRow as { email: string | null } | null)?.email ?? null;
      if (leadEmail) {
        const { linkThreadsByEmail } = await import("@/lib/linkEmailToEntity");
        const n = await linkThreadsByEmail(leadEmail, {
          lead_id: form.lead_id,
          customer_id: (leadRow as { customer_id: string | null } | null)?.customer_id ?? null,
        });
        if (n > 0) toast.success(`${n} thread(s) de e-mail vinculadas`);
      }
    }
    toast.success(t("saved"));
    setDialogOpen(false);
    setForm({ title: "", description: "", due_date: "", priority: "media", category: "suporte", lead_id: "", assigned_to: "" });
    loadData();
  };

  const priorityColor = (p: string) =>
    p === "alta" ? "bg-red-500/10 text-red-700 border-red-500/30" :
    p === "baixa" ? "bg-slate-500/10 text-slate-700 border-slate-500/30" :
    "bg-amber-500/10 text-amber-700 border-amber-500/30";

  const sourceIcon = (s: string) => s === "email" ? Mail : s === "lead" ? ExternalLink : Plus;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("activities")}</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? t("allTasks") : t("assignedTo")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />{t("newActivity")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("newActivity")}</DialogTitle></DialogHeader>
            <form onSubmit={createActivity} className="space-y-3">
              <div>
                <Label>{t("activityTitle")}</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <Label>{t("description")}</Label>
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("dueDate")}</Label>
                  <Input type="datetime-local" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div>
                  <Label>{t("priority")}</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">{t("priorityLow")}</SelectItem>
                      <SelectItem value="media">{t("priorityMedium")}</SelectItem>
                      <SelectItem value="alta">{t("priorityHigh")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("category")}</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })} disabled={!!form.lead_id}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suporte">{t("categorySupport")}</SelectItem>
                      <SelectItem value="negocio">{t("categoryBusiness")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("linkedLead")}</Label>
                  <Select value={form.lead_id || "none"} onValueChange={(v) => setForm({ ...form, lead_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {leadOptions.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.code ?? "—"} · {l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Atribuir a</Label>
                <Select value={form.assigned_to || "self"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "self" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Eu mesmo</SelectItem>
                    {allUsers
                      .filter((u) => u.user_id !== user?.id)
                      .map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.full_name || u.user_id.slice(0, 8)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
                <Button type="submit">{t("save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Clock} label={t("openTasks")} value={stats.open} />
        <StatCard icon={AlertCircle} label={t("overdue")} value={stats.overdue} accent="text-red-600" />
        <StatCard icon={CheckCircle2} label={t("completedToday")} value={stats.doneToday} accent="text-emerald-600" />
        <StatCard icon={Play} label={t("weekTimeTotal")} value={fmtTime(stats.weekMin)} />
      </div>

      {/* filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">{t("search")}</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} />
          </div>
          <div>
            <Label className="text-xs">{t("status")}</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="open">{t("openTasks")}</SelectItem>
                <SelectItem value="in_progress">{t("inProgress")}</SelectItem>
                <SelectItem value="done">{t("completed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("category")}</Label>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="negocio">{t("categoryBusiness")}</SelectItem>
                <SelectItem value="suporte">{t("categorySupport")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("priority")}</Label>
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as typeof priorityFilter)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="alta">{t("priorityHigh")}</SelectItem>
                <SelectItem value="media">{t("priorityMedium")}</SelectItem>
                <SelectItem value="baixa">{t("priorityLow")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* bulk actions bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium mr-2">{selectedIds.size} {t("selectedCount")}</span>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ completed: true, completed_at: new Date().toISOString() })}>
              <CheckCircle2 className="h-4 w-4 mr-1" />{t("bulkComplete")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ completed: false, completed_at: null })}>
              {t("bulkReopen")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ started_at: new Date().toISOString() })}>
              <Play className="h-4 w-4 mr-1" />{t("bulkStart")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ started_at: null })}>
              <Pause className="h-4 w-4 mr-1" />{t("bulkPause")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openLinkDialog(Array.from(selectedIds))}>
              <Link2 className="h-4 w-4 mr-1" />{t("linkToLead")}
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" />{t("bulkDelete")}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>{t("clearSelection")}</Button>
          </CardContent>
        </Card>
      )}

      {/* table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">{t("loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{t("noData")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((tk) => selectedIds.has(tk.id))}
                      onCheckedChange={(v) => {
                        if (v) setSelectedIds(new Set(filtered.map((tk) => tk.id)));
                        else clearSelection();
                      }}
                      aria-label="select all"
                    />
                  </TableHead>
                  <TableHead>{t("activityTitle")}</TableHead>
                  <TableHead>{t("linkedLead")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead>{t("priority")}</TableHead>
                  <TableHead>{t("dueDate")}</TableHead>
                  <TableHead>{t("timeSpent")}</TableHead>
                  <TableHead className="w-44 text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => {
                  const lead = task.lead_id ? leadsMap[task.lead_id] : null;
                  const SrcIcon = sourceIcon(task.source);
                  const isOverdue = !task.completed && task.due_date && isAfter(new Date(), new Date(task.due_date));
                  const inProgress = !!task.started_at && !task.completed;
                  return (
                    <>
                    <TableRow
                      key={task.id}
                      className={cn(task.completed && "opacity-60", selectedIds.has(task.id) && "bg-muted/50", "cursor-pointer")}
                      onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(task.id)}
                          onCheckedChange={() => toggleOne(task.id)}
                          aria-label="select"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <SrcIcon className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className={cn("font-medium truncate max-w-[280px]", task.completed && "line-through")}>{task.title}</div>
                            {task.description && <div className="text-xs text-muted-foreground truncate max-w-[280px]">{task.description}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {lead ? (
                          <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                            <Badge variant="outline" className="font-mono hover:bg-muted">{lead.code ?? lead.name}</Badge>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("looseTask")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {task.category === "negocio" ? t("categoryBusiness") : t("categorySupport")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={priorityColor(task.priority)}>
                          {task.priority === "alta" ? t("priorityHigh") : task.priority === "baixa" ? t("priorityLow") : t("priorityMedium")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.due_date ? (
                          <span className={cn("text-sm", isOverdue && "text-red-600 font-medium")}>
                            {format(new Date(task.due_date), "dd/MM HH:mm")}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{fmtTime(task.time_spent_minutes)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!canEdit(task) && (
                            <Badge variant="outline" className="text-[10px] mr-1">somente leitura</Badge>
                          )}
                          {!task.completed && (
                            <Button size="icon" variant="ghost" disabled={!canEdit(task)} onClick={() => toggleStarted(task)} title={inProgress ? t("pauseTask") : t("startTask")}>
                              {inProgress ? <Pause className="h-4 w-4 text-amber-600" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" disabled={!canEdit(task)} onClick={() => openLinkDialog([task.id])} title={t("linkToLead")}>
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={!isAdmin && task.created_by !== user?.id} onClick={() => removeTask(task)} title={t("delete")}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={!canEdit(task)} onClick={() => toggleComplete(task)} title={t("bulkComplete")}>
                            {task.completed
                              ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                              : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 hover:border-primary" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === task.id && (
                      <TableRow key={`${task.id}-exp`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={8}>
                          <TaskUpdatesPanel
                            taskId={task.id}
                            taskTitle={task.title}
                            leadId={task.lead_id}
                            onChanged={loadData}
                            onClose={() => setExpandedId(null)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("linkToLead")} ({linkTargetIds.length})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>{t("linkedLead")}</Label>
            {(() => {
              const sel = leadOptions.find((l) => l.id === linkLeadId);
              return (
                <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate">
                        {sel ? `${sel.code ?? "—"} · ${sel.name}${sel.destination ? ` · ${sel.destination}` : ""}` : t("searchLeadPlaceholder")}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t("searchLeadPlaceholder")} />
                      <CommandList>
                        <CommandEmpty>{t("noLeadsFound")}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__unlink__"
                            onSelect={() => { setLinkLeadId(""); setLinkPopoverOpen(false); }}
                          >
                            <Check className={cn("h-4 w-4 mr-2", !linkLeadId ? "opacity-100" : "opacity-0")} />
                            — {t("unlinkLead")}
                          </CommandItem>
                          {leadOptions.map((l) => (
                            <CommandItem
                              key={l.id}
                              value={`${l.code ?? ""} ${l.name} ${l.destination ?? ""}`}
                              onSelect={() => { setLinkLeadId(l.id); setLinkPopoverOpen(false); }}
                            >
                              <Check className={cn("h-4 w-4 mr-2", linkLeadId === l.id ? "opacity-100" : "opacity-0")} />
                              <span className="font-mono text-xs mr-2">{l.code ?? "—"}</span>
                              <span className="truncate">{l.name}</span>
                              {l.destination && <span className="text-muted-foreground text-xs ml-2 truncate">· {l.destination}</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={linkToLead}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; accent?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", accent)}>{value}</div>
      </CardContent>
    </Card>
  );
}
