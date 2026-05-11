import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  Phone,
  Mail,
  MessageSquare,
  Users as UsersIcon,
  StickyNote,
  Plus,
  CheckCircle2,
  Clock,
  Briefcase,
  Play,
  Pause,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { usePermissions, MaskedField } from "@/lib/permissions";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmailPanel } from "@/components/email/EmailPanel";
import { ProposalEditor } from "@/components/proposal/ProposalEditor";
import { TaskUpdatesPanel } from "@/components/TaskUpdatesPanel";
import { useWorkspaceWindows } from "@/components/workspace/WorkspaceWindowsProvider";
import { TaskWindow } from "@/components/workspace/windows/TaskWindow";

type WorkspaceSearch = { lead?: string };

export const Route = createFileRoute("/workspace")({
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <WorkspacePage />
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

type LeadOption = { id: string; name: string; code: string | null };
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
  customer_id: string | null;
};
type Task = { id: string; title: string; description: string | null; due_date: string | null; completed: boolean; priority: "baixa" | "media" | "alta"; started_at: string | null; completed_at: string | null };
type Interaction = { id: string; type: string; subject: string | null; content: string | null; occurred_at: string };
type Quote = { id: string; status: string; total_amount: number; currency: string; valid_until: string | null; created_at: string };
type Booking = { id: string; status: string; total_amount: number; currency: string; departure_date: string | null; return_date: string | null; customer_id: string | null; package_id?: string | null; invoice_number?: string | null; customer_name?: string | null; package_name?: string | null; voucher_code?: string | null };
type BookingPaxRow = { id: string; booking_id: string; is_primary: boolean; full_name: string };
type BookingSupplierRow = { id: string; booking_id: string; service_type: string | null; status: string | null; cost: number | null; currency: string | null; supplier_name: string | null };

function statusColor(s: string) {
  return s === "fechado" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" :
    s === "perdido" ? "bg-red-500/10 text-red-700 border-red-500/30" :
    s === "proposta" ? "bg-violet-500/10 text-violet-700 border-violet-500/30" :
    s === "cotacao" ? "bg-amber-500/10 text-amber-700 border-amber-500/30" :
    s === "qualificado" ? "bg-blue-500/10 text-blue-700 border-blue-500/30" :
    "bg-slate-500/10 text-slate-700 border-slate-500/30";
}

function WorkspacePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { format: fmtCurrency } = useCurrency();
  const navigate = useNavigate({ from: "/workspace" });
  const { lead: leadId } = Route.useSearch();

  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  // emails removed: Email tab uses EmailPanel which loads its own data
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingPax, setBookingPax] = useState<Record<string, BookingPaxRow[]>>({});
  const [bookingSuppliers, setBookingSuppliers] = useState<Record<string, BookingSupplierRow[]>>({});
  const [loadingLead, setLoadingLead] = useState(false);

  // Forms
  const [schedDate, setSchedDate] = useState("");
  const [schedDesc, setSchedDesc] = useState("");
  const [intType, setIntType] = useState<string>("ligacao");
  const [intContent, setIntContent] = useState("");

  // New-lead dialog
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nlName, setNlName] = useState("");
  const [nlEmail, setNlEmail] = useState("");
  const [nlPhone, setNlPhone] = useState("");
  const [nlDest, setNlDest] = useState("");

  // Load lead options (sidebar selector)
  const loadLeadOptions = async () => {
    const { data } = await supabase
      .from("leads")
      .select("id,name,code")
      .order("created_at", { ascending: false })
      .limit(50);
    setLeadOptions((data as LeadOption[]) ?? []);
  };

  useEffect(() => { loadLeadOptions(); }, []);

  // Load active lead data
  const loadLead = async (id: string) => {
    setLoadingLead(true);
    const [leadRes, tasksRes, intRes, quotesRes, bookingsRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).maybeSingle(),
      supabase.from("tasks").select("id,title,description,due_date,completed,priority,started_at,completed_at").eq("lead_id", id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("interactions").select("id,type,subject,content,occurred_at").eq("lead_id", id).order("occurred_at", { ascending: false }),
      supabase.from("quotes").select("id,status,total_amount,currency,valid_until,created_at").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("bookings").select("id,status,total_amount,currency,departure_date,return_date,customer_id,package_id").eq("lead_id", id).order("created_at", { ascending: false }),
    ]);
    setLead((leadRes.data as Lead | null) ?? null);
    setTasks((tasksRes.data as Task[]) ?? []);
    setInteractions((intRes.data as Interaction[]) ?? []);
    setQuotes((quotesRes.data as Quote[]) ?? []);
    const baseBookings = (bookingsRes.data as Booking[]) ?? [];
    const bookingIds = baseBookings.map((b) => b.id);
    const customerIds = Array.from(new Set(baseBookings.map((b) => b.customer_id).filter(Boolean) as string[]));
    let invoiceMap = new Map<string, string>();
    let custMap = new Map<string, string>();
    let paxByBooking: Record<string, BookingPaxRow[]> = {};
    let suppByBooking: Record<string, BookingSupplierRow[]> = {};
    let voucherMap = new Map<string, string>();
    let pkgMap = new Map<string, string>();
    if (bookingIds.length) {
      const pkgIds = Array.from(new Set(baseBookings.map((b) => b.package_id).filter(Boolean) as string[]));
      const [invRes, paxRes, suppRes, custRes, vouRes, pkgRes] = await Promise.all([
        supabase.from("invoices").select("booking_id,number,created_at").in("booking_id", bookingIds).order("created_at", { ascending: false }),
        supabase.from("booking_pax").select("id,booking_id,is_primary,customer_id,customers(full_name)").in("booking_id", bookingIds),
        supabase.from("booking_suppliers").select("id,booking_id,service_type,status,cost,currency,suppliers(name)").in("booking_id", bookingIds),
        customerIds.length ? supabase.from("customers").select("id,full_name").in("id", customerIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        supabase.from("vouchers").select("booking_id,code").in("booking_id", bookingIds),
        pkgIds.length ? supabase.from("packages").select("id,name").in("id", pkgIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      ((invRes.data ?? []) as { booking_id: string; number: string | null }[]).forEach((row) => {
        if (row.booking_id && row.number && !invoiceMap.has(row.booking_id)) invoiceMap.set(row.booking_id, row.number);
      });
      ((custRes.data ?? []) as { id: string; full_name: string }[]).forEach((c) => custMap.set(c.id, c.full_name));
      ((vouRes.data ?? []) as { booking_id: string; code: string }[]).forEach((v) => voucherMap.set(v.booking_id, v.code));
      ((pkgRes.data ?? []) as { id: string; name: string }[]).forEach((p) => pkgMap.set(p.id, p.name));
      ((paxRes.data ?? []) as Array<{ id: string; booking_id: string; is_primary: boolean; customers: { full_name: string } | null }>).forEach((row) => {
        const list = paxByBooking[row.booking_id] ?? [];
        list.push({ id: row.id, booking_id: row.booking_id, is_primary: !!row.is_primary, full_name: row.customers?.full_name ?? "—" });
        paxByBooking[row.booking_id] = list;
      });
      ((suppRes.data ?? []) as Array<{ id: string; booking_id: string; service_type: string | null; status: string | null; cost: number | null; currency: string | null; suppliers: { name: string } | null }>).forEach((row) => {
        const list = suppByBooking[row.booking_id] ?? [];
        list.push({ id: row.id, booking_id: row.booking_id, service_type: row.service_type, status: row.status, cost: row.cost, currency: row.currency, supplier_name: row.suppliers?.name ?? null });
        suppByBooking[row.booking_id] = list;
      });
    }
    setBookings(baseBookings.map((b) => ({
      ...b,
      invoice_number: invoiceMap.get(b.id) ?? null,
      customer_name: b.customer_id ? (custMap.get(b.customer_id) ?? null) : null,
      voucher_code: voucherMap.get(b.id) ?? null,
      package_name: b.package_id ? (pkgMap.get(b.package_id) ?? null) : null,
    })));
    setBookingPax(paxByBooking);
    setBookingSuppliers(suppByBooking);
    setLoadingLead(false);
  };

  useEffect(() => {
    if (leadId) loadLead(leadId);
    else {
      setLead(null);
      setTasks([]); setInteractions([]); setQuotes([]); setBookings([]); setBookingPax({}); setBookingSuppliers({});
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [leadId]);

  const selectLead = (id: string) => {
    navigate({ search: { lead: id } });
  };

  const updateStatus = async (status: LeadStatus) => {
    if (!lead) return;
    setLead({ ...lead, status });
    const { error } = await supabase.from("leads").update({ status }).eq("id", lead.id);
    if (error) { toast.error(error.message); loadLead(lead.id); }
    else toast.success(t("saved"));
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !lead || !schedDesc.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      lead_id: lead.id,
      title: schedDesc.slice(0, 80),
      description: schedDesc,
      due_date: schedDate ? new Date(schedDate).toISOString() : null,
      created_by: user.id,
      assigned_to: user.id,
    });
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); setSchedDate(""); setSchedDesc(""); loadLead(lead.id); }
  };

  const toggleTask = async (id: string, completed: boolean) => {
    if (!lead) return;
    await supabase.from("tasks").update({ completed: !completed }).eq("id", id);
    loadLead(lead.id);
  };

  const addInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !lead || !intContent.trim()) return;
    const { error } = await supabase.from("interactions").insert({
      lead_id: lead.id,
      type: intType as "ligacao",
      content: intContent,
      created_by: user.id,
    });
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); setIntContent(""); loadLead(lead.id); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlName.trim()) { toast.error(t("name") + " *"); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        name: nlName.trim(),
        email: nlEmail.trim() || null,
        phone: nlPhone.trim() || null,
        destination: nlDest.trim() || null,
        created_by: user?.id ?? null,
        assigned_to: user?.id ?? null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) { toast.error(error?.message ?? t("errorOccurred")); return; }
    toast.success(t("leadCreated"));
    setNewOpen(false);
    setNlName(""); setNlEmail(""); setNlPhone(""); setNlDest("");
    await loadLeadOptions();
    selectLead(data.id);
  };

  const sortedTasks = useMemo(() => tasks, [tasks]);
  const hasLead = Boolean(lead);
  const win = useWorkspaceWindows();

  type SectionKey = "email" | "activities" | "proposals" | "invoice" | "reservation";
  const openSection = (key: SectionKey) => {
    if (!lead) return;
    let title = "";
    let content: React.ReactNode = null;
    if (key === "email") {
      title = t("intEmail");
      content = <div className="h-full"><EmailPanel mode="lead" leadId={lead.id} customerId={lead.customer_id} inlineReader /></div>;
    } else if (key === "activities") {
      title = t("activities");
      content = <div className="p-4"><ActivitiesTab leadId={lead.id} tasks={tasks} onChanged={() => loadLead(lead.id)} /></div>;
    } else if (key === "proposals") {
      title = t("proposals");
      content = <div className="p-4"><ProposalsTab leadId={lead.id} leadCode={lead.code} customerId={lead.customer_id} quotes={quotes} onChanged={() => loadLead(lead.id)} mode="proposal" /></div>;
    } else if (key === "invoice") {
      title = t("invoice");
      content = <div className="p-4"><ProposalsTab leadId={lead.id} leadCode={lead.code} customerId={lead.customer_id} quotes={quotes.filter((q) => q.status === "aprovada")} onChanged={() => loadLead(lead.id)} mode="invoice" /></div>;
    } else {
      title = t("reservation");
      content = (
        <div className="p-4 space-y-4">
          {renderBookingsTable(bookings)}
          {bookings.map((b) => (
            <div key={`detail-${b.id}`}>{renderBookingCard(b, true)}</div>
          ))}
        </div>
      );
    }
    win.openWindow({
      id: `section:${key}:${lead.id}`,
      title: `${lead.name} · ${title}`,
      content,
      sizeKey: `section.${key}`,
      defaultSize: { width: 1100, height: 720 },
    });
  };

  const BOOKING_STATUSES = ["pre_reserva", "confirmada", "em_viagem", "concluida", "cancelada"];
  const bookingStatusColor = (s: string) =>
    s === "confirmada" ? "bg-emerald-500/10 text-emerald-700" :
    s === "cancelada" ? "bg-red-500/10 text-red-700" :
    s === "em_viagem" ? "bg-blue-500/10 text-blue-700" :
    s === "concluida" ? "bg-slate-500/10 text-slate-700" :
    "bg-amber-500/10 text-amber-700";

  const updateBookingStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("bookings").update({ status: status as "pre_reserva" }).eq("id", id);
    if (error) toast.error(error.message); else if (lead) loadLead(lead.id);
  };

  const renderBookingsTable = (list: Booking[]) => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("invoiceNumber")}</TableHead>
            <TableHead>{t("customers")}</TableHead>
            <TableHead>{t("packages")}</TableHead>
            <TableHead>{t("departureDate")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead className="text-right">Voucher</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">{t("noBookings")}</TableCell></TableRow>
          ) : list.map((b) => {
            const pax = bookingPax[b.id] ?? [];
            const cliLabel = b.customer_name ?? pax.find((p) => p.is_primary)?.full_name ?? pax[0]?.full_name ?? "—";
            return (
              <TableRow key={b.id} onDoubleClick={() => openBookingWindow(b)} className="cursor-pointer">
                <TableCell>
                  {b.invoice_number ? (
                    <Badge variant="outline" className="font-mono">{b.invoice_number}</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30" title={t("noInvoiceForBooking")}>sem invoice</Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">{cliLabel}</TableCell>
                <TableCell>{b.package_name ?? "—"}</TableCell>
                <TableCell>{b.departure_date ?? "—"}</TableCell>
                <TableCell>
                  <MaskedField module="bookings" field="total_amount" value={fmtCurrency(Number(b.total_amount), b.currency as "BRL")} />
                </TableCell>
                <TableCell>
                  <Select value={b.status} onValueChange={(v) => updateBookingStatus(b.id, v)}>
                    <SelectTrigger className="h-8 w-36">
                      <Badge variant="outline" className={bookingStatusColor(b.status)}>{b.status}</Badge>
                    </SelectTrigger>
                    <SelectContent>{BOOKING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  {b.voucher_code ? (
                    <Badge variant="outline" className="font-mono">{b.voucher_code}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/bookings/$bookingId" params={{ bookingId: b.id }}>{t("openBooking")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );

  const renderBookingCard = (b: Booking, expanded: boolean) => {
    const pax = bookingPax[b.id] ?? [];
    const supps = bookingSuppliers[b.id] ?? [];
    const customerLabel = b.customer_name ?? pax.find((p) => p.is_primary)?.full_name ?? pax[0]?.full_name ?? "—";
    return (
      <div key={b.id} className="rounded-md border bg-card">
        <div className="p-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">{b.status.replace("_", " ")}</Badge>
              {b.invoice_number ? (
                <Badge variant="outline" className="font-mono">{t("invoiceNumber")}: {b.invoice_number}</Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30" title={t("noInvoiceForBooking")}>{t("invoiceNumber")}: —</Badge>
              )}
            </div>
            <div className="text-sm font-medium mt-1 truncate">{customerLabel}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {b.departure_date && format(new Date(b.departure_date), "dd/MM/yyyy")}
              {b.return_date && ` → ${format(new Date(b.return_date), "dd/MM/yyyy")}`}
            </div>
          </div>
          <div className="font-semibold text-right whitespace-nowrap">
            <MaskedField module="bookings" field="total_amount" value={fmtCurrency(Number(b.total_amount), b.currency as "BRL")} />
          </div>
        </div>
        {expanded && (pax.length > 0 || supps.length > 0) && (
          <div className="border-t p-3 space-y-2">
            {pax.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("passengers")}</div>
                <ul className="text-sm space-y-0.5">
                  {pax.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <span>{p.full_name}</span>
                      {p.is_primary && <Badge variant="outline" className="text-[10px] py-0 px-1.5">principal</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {supps.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("services")}</div>
                <ul className="text-sm space-y-0.5">
                  {supps.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {s.service_type ?? "—"}{s.supplier_name ? ` · ${s.supplier_name}` : ""}
                        {s.status ? ` · ${s.status}` : ""}
                      </span>
                      {s.cost != null && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          <MaskedField module="bookings" field="total_amount" value={fmtCurrency(Number(s.cost), (s.currency ?? "BRL") as "BRL")} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const openBookingWindow = (b: Booking) => {
    const customerLabel = b.customer_name ?? (bookingPax[b.id] ?? []).find((p) => p.is_primary)?.full_name ?? "—";
    win.openWindow({
      id: `booking:${b.id}`,
      title: `${t("reservation")} ${b.invoice_number ? `· ${b.invoice_number}` : ""} · ${customerLabel}`,
      sizeKey: "booking",
      defaultSize: { width: 760, height: 600 },
      content: <div className="p-4">{renderBookingCard(b, true)}</div>,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Briefcase className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">{t("workspace")}</h1>
          <p className="text-sm text-muted-foreground">{t("workspaceIntro")}</p>
        </div>
        {lead && (
          <Badge variant="outline" className={cn("font-mono", statusColor(lead.status))}>
            {lead.code ?? "—"}
          </Badge>
        )}
      </div>

      <ResizablePanelGroup
        direction="horizontal"
        className="min-h-[600px]"
      >
        <ResizablePanel defaultSize="28%" minSize="18%" maxSize="45%">
        {/* SIDEBAR */}
        <div className="space-y-4 pr-2">
          {/* Lead Selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("selectLead")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={lead?.id ?? ""} onValueChange={selectLead}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectLeadPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {leadOptions.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">{t("workspaceEmpty")}</div>
                  ) : leadOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="font-medium">{o.name}</span>
                      {o.code && <span className="ml-2 text-xs text-muted-foreground font-mono">{o.code}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <Plus className="h-3.5 w-3.5 mr-1" />{t("newLead")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("createNewLead")}</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-3">
                    <div><Label>{t("name")} *</Label><Input value={nlName} onChange={(e) => setNlName(e.target.value)} required /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t("email")}</Label><Input type="email" value={nlEmail} onChange={(e) => setNlEmail(e.target.value)} /></div>
                      <div><Label>{t("phone")}</Label><Input value={nlPhone} onChange={(e) => setNlPhone(e.target.value)} /></div>
                    </div>
                    <div><Label>{t("destination")}</Label><Input value={nlDest} onChange={(e) => setNlDest(e.target.value)} /></div>
                    <Button type="submit" className="w-full" disabled={creating}>
                      {creating ? t("loading") : t("save")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Identification */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("identification")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!hasLead ? (
                <p className="text-xs text-muted-foreground">{t("noLeadSelected")}</p>
              ) : (
                <>
                  <div>
                    <div className="text-lg font-bold">{lead!.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{lead!.code}</div>
                  </div>
                  <Separator />
                  <div className="space-y-1.5 text-sm">
                    {lead!.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{lead!.email}</div>}
                    {lead!.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{lead!.phone}</div>}
                    {lead!.destination && <div><span className="text-muted-foreground">{t("destination")}: </span>{lead!.destination}</div>}
                    {lead!.estimated_value && (
                      <div><span className="text-muted-foreground">{t("estimatedValue")}: </span>
                        <span className="font-semibold">{fmtCurrency(Number(lead!.estimated_value), lead!.currency as "BRL")}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("funnelStage")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {STATUSES.map((s) => {
                const isActive = lead?.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => hasLead && updateStatus(s)}
                    disabled={!hasLead}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm border transition-colors capitalize",
                      isActive ? statusColor(s) + " font-semibold" : "border-transparent hover:bg-muted text-muted-foreground",
                      !hasLead && "opacity-50 cursor-not-allowed hover:bg-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", isActive ? "bg-current" : "bg-muted-foreground/40")} />
                      {s}
                    </div>
                  </button>
                );
              })}
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
                  <Input type="datetime-local" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} disabled={!hasLead} />
                </div>
                <div>
                  <Label className="text-xs">{t("scheduleDescription")}</Label>
                  <Textarea rows={2} value={schedDesc} onChange={(e) => setSchedDesc(e.target.value)} placeholder="..." disabled={!hasLead} />
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={!hasLead}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{t("addToSchedule")}
                </Button>
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
                <Select value={intType} onValueChange={setIntType} disabled={!hasLead}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((it) => (
                      <SelectItem key={it.value} value={it.value}>{t(it.labelKey as "intCall")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea rows={2} value={intContent} onChange={(e) => setIntContent(e.target.value)} placeholder="..." disabled={!hasLead} />
                <Button type="submit" size="sm" className="w-full" disabled={!hasLead}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{t("addInteraction")}
                </Button>
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
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="72%" minSize="55%">
        {/* MAIN */}
        <Card className="min-h-[600px] ml-2">
          <CardContent className="p-4">
            <Accordion type="multiple" defaultValue={["email"]} className="w-full">
              <AccordionItem value="email">
                <AccordionTrigger className="text-sm font-semibold" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openSection("email"); }} title="Duplo-clique para abrir em janela">
                  <span className="flex items-center gap-2 select-none"><Mail className="h-4 w-4" />{t("intEmail")}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {!hasLead || !lead ? (
                    <EmptyTab text={t("selectLeadToView")} />
                  ) : (
                    <EmailPanel mode="lead" leadId={lead.id} customerId={lead.customer_id} inlineReader />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="activities">
                <AccordionTrigger className="text-sm font-semibold" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openSection("activities"); }} title="Duplo-clique para abrir em janela">
                  <span className="flex items-center gap-2 select-none"><CheckCircle2 className="h-4 w-4" />{t("activities")}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {!hasLead || !lead ? (
                    <EmptyTab text={t("selectLeadToView")} />
                  ) : (
                    <ActivitiesTab leadId={lead.id} tasks={tasks} onChanged={() => loadLead(lead.id)} />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="proposals">
                <AccordionTrigger className="text-sm font-semibold" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openSection("proposals"); }} title="Duplo-clique para abrir em janela">
                  <span className="flex items-center gap-2 select-none"><StickyNote className="h-4 w-4" />{t("proposals")}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {!hasLead || !lead ? (
                    <EmptyTab text={t("selectLeadToView")} />
                  ) : (
                    <ProposalsTab
                      leadId={lead.id}
                      leadCode={lead.code}
                      customerId={lead.customer_id}
                      quotes={quotes}
                      onChanged={() => loadLead(lead.id)}
                      mode="proposal"
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="invoice">
                <AccordionTrigger className="text-sm font-semibold" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openSection("invoice"); }} title="Duplo-clique para abrir em janela">
                  <span className="flex items-center gap-2 select-none"><Briefcase className="h-4 w-4" />{t("invoice")}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {!hasLead || !lead ? (
                    <EmptyTab text={t("selectLeadToView")} />
                  ) : (
                    <ProposalsTab
                      leadId={lead.id}
                      leadCode={lead.code}
                      customerId={lead.customer_id}
                      quotes={quotes.filter((q) => q.status === "aprovada")}
                      onChanged={() => loadLead(lead.id)}
                      mode="invoice"
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="reservation">
                <AccordionTrigger className="text-sm font-semibold" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openSection("reservation"); }} title="Duplo-clique para abrir em janela">
                  <span className="flex items-center gap-2 select-none"><CalendarIcon className="h-4 w-4" />{t("reservation")}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {!hasLead ? (
                    <EmptyTab text={t("selectLeadToView")} />
                  ) : (
                    renderBookingsTable(bookings)
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="py-16 text-center">
      <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ProposalsTab({
  leadId,
  leadCode,
  customerId,
  quotes,
  onChanged,
  mode,
}: {
  leadId: string;
  leadCode: string | null;
  customerId: string | null;
  quotes: Quote[];
  onChanged: () => void;
  mode: "proposal" | "invoice";
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canCreateQuote = can("quotes", "create");
  const { format: fmtCurrency } = useCurrency();
  const win = useWorkspaceWindows();
  const [creating, setCreating] = useState(false);

  const openInWindow = (q: Quote) => {
    win.openWindow({
      id: `${mode}:${q.id}`,
      title: `${mode === "invoice" ? t("invoice") : t("proposals")} #${q.id.slice(0, 8)}`,
      sizeKey: mode,
      defaultSize: { width: 1200, height: 760 },
      content: (
        <div className="p-4">
          <ProposalEditor
            quoteId={q.id}
            leadId={leadId}
            leadCode={leadCode}
            customerId={customerId}
            mode={mode}
            onSaved={onChanged}
            onClose={() => win.closeWindow(`${mode}:${q.id}`)}
          />
        </div>
      ),
    });
  };

  const invoiceCodeFor = (q: Quote) =>
    leadCode ? `IN${leadCode}` : `IN${q.id.slice(0, 8).toUpperCase()}`;

  const createNew = async () => {
    if (!user) return;
    if (!canCreateQuote) { toast.error("Sem permissão para criar proposta"); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        lead_id: leadId,
        customer_id: customerId,
        created_by: user.id,
        status: "rascunho",
        currency: "USD",
        total_amount: 0,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error) return toast.error(error.message);
    onChanged();
    openInWindow({ ...(data as any), status: "rascunho", total_amount: 0, currency: "USD", created_at: new Date().toISOString() } as Quote);
  };

  return (
    <div className="space-y-3">
      {mode === "proposal" && canCreateQuote && (
        <div className="flex justify-end">
          <Button size="sm" onClick={createNew} disabled={creating}>
            <Plus className="h-4 w-4 mr-1" /> {t("newProposal")}
          </Button>
        </div>
      )}
      {quotes.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {mode === "proposal" ? t("noProposals") : t("noInvoices")}
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => {
            const closed = q.status === "aprovada";
            return (
              <button
                key={q.id}
                onClick={() => openInWindow(q)}
                title="Abrir proposta"
                className={cn(
                  "w-full text-left p-3 rounded-md border hover:bg-muted/40 flex items-center justify-between",
                  closed && "border-emerald-500/40 bg-emerald-500/5",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {closed ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">
                        {t("proposalClosed")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="capitalize">{q.status}</Badge>
                    )}
                    {closed && (
                      <Badge variant="outline" className="font-mono border-emerald-500/40 text-emerald-700">
                        {invoiceCodeFor(q)}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    #{q.id.slice(0, 8)} · {format(new Date(q.created_at), "dd/MM/yyyy")}
                    {q.valid_until && ` · ${t("validUntil")}: ${format(new Date(q.valid_until), "dd/MM/yyyy")}`}
                  </div>
                </div>
                <div className="font-semibold"><MaskedField module="quotes" field="total_amount" value={fmtCurrency(Number(q.total_amount), q.currency as "BRL")} /></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivitiesTab({ leadId, tasks, onChanged }: { leadId: string; tasks: Task[]; onChanged: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const win = useWorkspaceWindows();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta">("media");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openTaskWindow = (task: Task) => {
    const id = `task:${task.id}`;
    win.openWindow({
      id,
      title: task.title,
      sizeKey: "task",
      defaultSize: { width: 720, height: 520 },
      content: (
        <TaskWindow
          task={task}
          leadId={leadId}
          onChanged={onChanged}
          onClose={() => win.closeWindow(id)}
        />
      ),
    });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: title.slice(0, 200),
      description: description || null,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      priority,
      category: "negocio",
      source: "manual",
      lead_id: leadId,
      created_by: user.id,
      assigned_to: user.id,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setTitle(""); setDescription(""); setDueDate(""); setPriority("media");
      onChanged();
    }
  };

  const toggleComplete = async (task: Task) => {
    const { error } = await supabase.from("tasks").update({ completed: !task.completed }).eq("id", task.id);
    if (error) toast.error(error.message); else onChanged();
  };

  const toggleStarted = async (task: Task) => {
    const newStarted = task.started_at ? null : new Date().toISOString();
    const { error } = await supabase.from("tasks").update({ started_at: newStarted }).eq("id", task.id);
    if (error) toast.error(error.message); else onChanged();
  };

  const remove = async (task: Task) => {
    if (!confirm(`${t("delete")}?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message); else onChanged();
  };

  const priorityColor = (p: string) =>
    p === "alta" ? "bg-red-500/10 text-red-700 border-red-500/30" :
    p === "baixa" ? "bg-slate-500/10 text-slate-700 border-slate-500/30" :
    "bg-amber-500/10 text-amber-700 border-amber-500/30";

  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <form onSubmit={create} className="space-y-3">
            <div>
              <Label className="text-xs">{t("activityTitle")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t("newActivity")} />
            </div>
            <div>
              <Label className="text-xs">{t("description")}</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("dueDate")}</Label>
                <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("priority")}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">{t("priorityLow")}</SelectItem>
                    <SelectItem value="media">{t("priorityMedium")}</SelectItem>
                    <SelectItem value="alta">{t("priorityHigh")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" size="sm" disabled={saving || !title.trim()}>
              <Plus className="h-4 w-4 mr-1" />{t("newActivity")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">{t("noData")}</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((task) => {
            const isOverdue = !task.completed && task.due_date && new Date(task.due_date) < new Date();
            const inProgress = !!task.started_at && !task.completed;
            const isExpanded = expandedId === task.id;
            return (
              <div key={task.id} onDoubleClick={() => openTaskWindow(task)} title="Duplo-clique para abrir em janela" className={cn("rounded-md border", task.completed && "opacity-60")}>
                <div className="flex items-start gap-3 p-3">
                  <button onClick={(e) => { e.stopPropagation(); toggleComplete(task); }} className="mt-0.5" aria-label="toggle">
                    {task.completed
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 hover:border-primary" />}
                  </button>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={cn("font-medium", task.completed && "line-through")}>{task.title}</div>
                      <Badge variant="outline" className={priorityColor(task.priority)}>
                        {task.priority === "alta" ? t("priorityHigh") : task.priority === "baixa" ? t("priorityLow") : t("priorityMedium")}
                      </Badge>
                      {inProgress && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">{t("inProgress")}</Badge>}
                    </div>
                    {task.description && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{task.description}</div>}
                    {task.due_date && (
                      <div className={cn("text-xs mt-1 flex items-center gap-1", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                        {isOverdue && <AlertCircle className="h-3 w-3" />}
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(task.due_date), "dd/MM/yyyy HH:mm")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!task.completed && (
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleStarted(task); }} title={inProgress ? t("pauseTask") : t("startTask")}>
                        {inProgress ? <Pause className="h-4 w-4 text-amber-600" /> : <Play className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(task); }} title={t("delete")}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3">
                    <TaskUpdatesPanel
                      taskId={task.id}
                      taskTitle={task.title}
                      leadId={leadId}
                      onChanged={onChanged}
                      onClose={() => setExpandedId(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
