import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar as CalendarIcon, Phone, Mail, MessageSquare, Users as UsersIcon, StickyNote, Plus, CheckCircle2, Clock, AlertCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { computeLeadSla } from "@/lib/leadSla";

export const Route = createFileRoute("/leads/$leadId")({
  validateSearch: (search: Record<string, unknown>) => ({
    quickContact: typeof search.quickContact === "string" ? (search.quickContact as string) : undefined,
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <LeadWorkspace />
      </AppShell>
    </AuthGate>
  ),
});

const STATUSES = ["novo", "qualificado", "cotacao", "proposta", "fechado", "perdido"] as const;
type LeadStatus = typeof STATUSES[number];

const INTERACTION_TYPES = [
  { value: "ligacao", labelKey: "intCall", icon: Phone },
  { value: "email", labelKey: "intEmail", icon: Mail },
  { value: "whatsapp", labelKey: "intWhatsapp", icon: MessageSquare },
  { value: "reuniao", labelKey: "intMeeting", icon: UsersIcon },
  { value: "nota", labelKey: "intNote", icon: StickyNote },
] as const;

type Lead = {
  id: string;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  destination: string | null;
  estimated_value: number | null;
  currency: string;
  status: LeadStatus;
  notes: string | null;
  updated_at: string;
  next_action_date: string | null;
  next_action: string | null;
};

type Task = { id: string; title: string; description: string | null; due_date: string | null; completed: boolean };
type Interaction = { id: string; type: string; subject: string | null; content: string | null; occurred_at: string };
type Email = { id: string; subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null; received_at: string | null; is_unread: boolean };
type Quote = { id: string; status: string; total_amount: number; currency: string; valid_until: string | null; created_at: string };
type Booking = { id: string; status: string; total_amount: number; currency: string; departure_date: string | null; return_date: string | null };

function LeadWorkspace() {
  const { leadId } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { format: fmtCurrency } = useCurrency();
  const navigate = useNavigate();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Schedule form
  const [schedDate, setSchedDate] = useState("");
  const [schedDesc, setSchedDesc] = useState("");

  // Interaction form
  const [intType, setIntType] = useState<string>("ligacao");
  const [intContent, setIntContent] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<string>("ligacao");
  const [quickContent, setQuickContent] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [leadRes, tasksRes, intRes, emailsRes, quotesRes, bookingsRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("tasks").select("id,title,description,due_date,completed").eq("lead_id", leadId).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("interactions").select("id,type,subject,content,occurred_at").eq("lead_id", leadId).order("occurred_at", { ascending: false }),
      supabase.from("emails").select("id,subject,from_name,from_email,snippet,received_at,is_unread").eq("lead_id", leadId).order("received_at", { ascending: false }).limit(50),
      supabase.from("quotes").select("id,status,total_amount,currency,valid_until,created_at").eq("lead_id", leadId).order("created_at", { ascending: false }),
      supabase.from("bookings").select("id,status,total_amount,currency,departure_date,return_date").eq("lead_id", leadId).order("created_at", { ascending: false }),
    ]);
    setLead((leadRes.data as Lead | null) ?? null);
    setTasks((tasksRes.data as Task[]) ?? []);
    setInteractions((intRes.data as Interaction[]) ?? []);
    setEmails((emailsRes.data as Email[]) ?? []);
    setQuotes((quotesRes.data as Quote[]) ?? []);
    setBookings((bookingsRes.data as Booking[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId]);

  const updateStatus = async (status: LeadStatus) => {
    if (!lead) return;
    setLead({ ...lead, status });
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    if (error) { toast.error(error.message); loadAll(); }
    else toast.success(t("saved"));
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !schedDesc.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      lead_id: leadId,
      title: schedDesc.slice(0, 80),
      description: schedDesc,
      due_date: schedDate ? new Date(schedDate).toISOString() : null,
      created_by: user.id,
      assigned_to: user.id,
    });
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); setSchedDate(""); setSchedDesc(""); loadAll(); }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    await supabase.from("tasks").update({ completed: !completed }).eq("id", id);
    loadAll();
  };

  const addInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !intContent.trim()) return;
    const { error } = await supabase.from("interactions").insert({
      lead_id: leadId,
      type: intType as "ligacao",
      content: intContent,
      created_by: user.id,
    });
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); setIntContent(""); loadAll(); }
  };

  const submitQuickContact = async () => {
    if (!user || !quickContent.trim()) return;
    setQuickSaving(true);
    const { error } = await supabase.from("interactions").insert({
      lead_id: leadId,
      type: quickType as "ligacao",
      content: quickContent,
      created_by: user.id,
    });
    setQuickSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    setQuickContent("");
    setQuickOpen(false);
    loadAll();
  };

  const statusColor = (s: string) =>
    s === "fechado" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" :
    s === "perdido" ? "bg-red-500/10 text-red-700 border-red-500/30" :
    s === "proposta" ? "bg-violet-500/10 text-violet-700 border-violet-500/30" :
    s === "cotacao" ? "bg-amber-500/10 text-amber-700 border-amber-500/30" :
    s === "qualificado" ? "bg-blue-500/10 text-blue-700 border-blue-500/30" :
    "bg-slate-500/10 text-slate-700 border-slate-500/30";

  const sortedTasks = useMemo(() => tasks, [tasks]);

  if (loading) return <div className="p-8 text-muted-foreground">{t("loading")}</div>;
  if (!lead) return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate({ to: "/leads" })}><ArrowLeft className="h-4 w-4 mr-2" />{t("backToList")}</Button>
      <Card><CardContent className="py-12 text-center text-muted-foreground">{t("leadNotFound")}</CardContent></Card>
    </div>
  );

  const sla = computeLeadSla({
    status: lead.status,
    updated_at: lead.updated_at,
    next_action_date: lead.next_action_date,
    lastInteractionAt: interactions[0]?.occurred_at ?? null,
  });
  const slaBadge =
    sla.level === "overdue"
      ? { cls: "bg-destructive/10 text-destructive border-destructive/40", Icon: AlertCircle, label: t("slaOverdue") }
      : sla.level === "warning"
      ? { cls: "bg-amber-500/10 text-amber-700 border-amber-500/40", Icon: AlertTriangle, label: t("slaAtRisk") }
      : { cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40", Icon: ShieldCheck, label: "OK" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/leads"><ArrowLeft className="h-4 w-4 mr-2" />{t("backToList")}</Link>
        </Button>
        <div className="flex items-center gap-2">
          {sla.level !== "ok" && (
            <Button
              size="sm"
              variant={sla.level === "overdue" ? "destructive" : "default"}
              onClick={() => { setQuickType("ligacao"); setQuickContent(""); setQuickOpen(true); }}
            >
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              {t("addInteraction")}
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={cn("gap-1.5 cursor-default", slaBadge.cls)}>
                  <slaBadge.Icon className="h-3 w-3" />
                  {slaBadge.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs space-y-1">
                <div className="font-medium">{slaBadge.label}</div>
                {sla.daysSinceLast !== null && (
                  <div className="text-xs">
                    {t("slaDaysIdle").replace("{n}", String(sla.daysSinceLast))}
                    {sla.threshold !== null && ` / ${sla.threshold}d`}
                  </div>
                )}
                {sla.nextActionOverdue && (
                  <div className="text-xs text-destructive">
                    {t("slaNextActionOverdue")}
                    {lead.next_action_date && ` · ${new Date(lead.next_action_date).toLocaleDateString()}`}
                  </div>
                )}
                {!sla.nextActionOverdue && lead.next_action_date && (
                  <div className="text-xs text-muted-foreground">
                    {t("nextAction")}: {new Date(lead.next_action_date).toLocaleDateString()}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Badge variant="outline" className={cn("font-mono", statusColor(lead.status))}>{lead.code ?? "—"}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* SIDEBAR */}
        <div className="space-y-4">
          {/* Identification */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("identification")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <div className="text-lg font-bold">{lead.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{lead.code}</div>
              </div>
              <Separator />
              <div className="space-y-1.5 text-sm">
                {lead.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{lead.email}</div>}
                {lead.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{lead.phone}</div>}
                {lead.destination && <div><span className="text-muted-foreground">{t("destination")}: </span>{lead.destination}</div>}
                {lead.estimated_value && (
                  <div><span className="text-muted-foreground">{t("estimatedValue")}: </span>
                    <span className="font-semibold">{fmtCurrency(Number(lead.estimated_value), lead.currency as "BRL")}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("funnelStage")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm border transition-colors capitalize",
                    lead.status === s
                      ? statusColor(s) + " font-semibold"
                      : "border-transparent hover:bg-muted text-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", lead.status === s ? "bg-current" : "bg-muted-foreground/40")} />
                    {s}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />{t("schedule")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={addSchedule} className="space-y-2">
                <div>
                  <Label className="text-xs">{t("scheduleDate")}</Label>
                  <Input type="datetime-local" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t("scheduleDescription")}</Label>
                  <Textarea rows={2} value={schedDesc} onChange={(e) => setSchedDesc(e.target.value)} placeholder="..." />
                </div>
                <Button type="submit" size="sm" className="w-full"><Plus className="h-3.5 w-3.5 mr-1" />{t("addToSchedule")}</Button>
              </form>
              {sortedTasks.length > 0 && (
                <>
                  <Separator />
                  <ScrollArea className="max-h-48">
                    <div className="space-y-1.5">
                      {sortedTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => toggleTask(task.id, task.completed)}
                          className="w-full text-left p-2 rounded hover:bg-muted text-xs flex items-start gap-2"
                        >
                          {task.completed
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            : <Clock className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className={cn("truncate", task.completed && "line-through text-muted-foreground")}>{task.title}</div>
                            {task.due_date && <div className="text-muted-foreground">{format(new Date(task.due_date), "dd/MM/yy HH:mm")}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("contactHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={addInteraction} className="space-y-2">
                <Select value={intType} onValueChange={setIntType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((it) => (
                      <SelectItem key={it.value} value={it.value}>{t(it.labelKey as "intCall")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea rows={2} value={intContent} onChange={(e) => setIntContent(e.target.value)} placeholder="..." />
                <Button type="submit" size="sm" className="w-full"><Plus className="h-3.5 w-3.5 mr-1" />{t("addInteraction")}</Button>
              </form>
              {interactions.length > 0 && (
                <>
                  <Separator />
                  <ScrollArea className="max-h-64">
                    <div className="space-y-2">
                      {interactions.map((it) => {
                        const typeMeta = INTERACTION_TYPES.find((x) => x.value === it.type);
                        const Icon = typeMeta?.icon ?? StickyNote;
                        return (
                          <div key={it.id} className="text-xs border-l-2 border-primary/40 pl-2 py-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Icon className="h-3 w-3" />
                              <span>{typeMeta ? t(typeMeta.labelKey as "intCall") : it.type}</span>
                              <span>·</span>
                              <span>{format(new Date(it.occurred_at), "dd/MM HH:mm")}</span>
                            </div>
                            {it.content && <div className="mt-0.5 text-foreground whitespace-pre-wrap">{it.content}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* MAIN */}
        <Card className="min-h-[600px]">
          <CardContent className="p-4">
            <Tabs defaultValue="email">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="email">{t("intEmail")}</TabsTrigger>
                <TabsTrigger value="proposals">{t("proposals")}</TabsTrigger>
                <TabsTrigger value="invoice">{t("invoice")}</TabsTrigger>
                <TabsTrigger value="reservation">{t("reservation")}</TabsTrigger>
                <TabsTrigger value="history">{t("activityTimeline")}</TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="mt-4">
                {emails.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("noEmailsYet")}</div>
                ) : (
                  <div className="space-y-2">
                    {emails.map((em) => (
                      <div key={em.id} className={cn("p-3 rounded-md border", em.is_unread && "bg-primary/5 border-primary/30")}>
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-medium text-sm truncate">{em.from_name ?? em.from_email}</div>
                          <div className="text-xs text-muted-foreground shrink-0">{em.received_at ? format(new Date(em.received_at), "dd/MM HH:mm") : ""}</div>
                        </div>
                        <div className="text-sm font-semibold truncate">{em.subject ?? "(sem assunto)"}</div>
                        {em.snippet && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{em.snippet}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="proposals" className="mt-4">
                {quotes.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("noProposals")}</div>
                ) : (
                  <div className="space-y-2">
                    {quotes.map((q) => (
                      <div key={q.id} className="p-3 rounded-md border flex items-center justify-between">
                        <div>
                          <Badge variant="outline" className="capitalize">{q.status}</Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(q.created_at), "dd/MM/yyyy")}
                            {q.valid_until && ` · ${t("upcoming")}: ${format(new Date(q.valid_until), "dd/MM/yyyy")}`}
                          </div>
                        </div>
                        <div className="font-semibold">{fmtCurrency(Number(q.total_amount), q.currency as "BRL")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="invoice" className="mt-4">
                <div className="py-12 text-center text-muted-foreground text-sm">{t("invoiceComingSoon")}</div>
              </TabsContent>

              <TabsContent value="reservation" className="mt-4">
                {bookings.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("noBookings")}</div>
                ) : (
                  <div className="space-y-2">
                    {bookings.map((b) => (
                      <div key={b.id} className="p-3 rounded-md border flex items-center justify-between">
                        <div>
                          <Badge variant="outline" className="capitalize">{b.status.replace("_", " ")}</Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {b.departure_date && format(new Date(b.departure_date), "dd/MM/yyyy")}
                            {b.return_date && ` → ${format(new Date(b.return_date), "dd/MM/yyyy")}`}
                          </div>
                        </div>
                        <div className="font-semibold">{fmtCurrency(Number(b.total_amount), b.currency as "BRL")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <ActivityTimeline entityType="lead" entityId={lead.id} />
              </TabsContent>
            </Tabs>
          </CardContent>
      </Card>
      </div>

      <Dialog open={quickOpen} onOpenChange={(o) => !quickSaving && setQuickOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addInteraction")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={quickType} onValueChange={setQuickType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((it) => (
                  <SelectItem key={it.value} value={it.value}>{t(it.labelKey as "intCall")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              rows={4}
              autoFocus
              value={quickContent}
              onChange={(e) => setQuickContent(e.target.value)}
              placeholder="..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)} disabled={quickSaving}>{t("cancel")}</Button>
            <Button onClick={submitQuickContact} disabled={quickSaving || !quickContent.trim()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
