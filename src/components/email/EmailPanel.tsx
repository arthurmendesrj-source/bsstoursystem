import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Mail, RefreshCw, Reply, Forward, Archive, Trash2, Check, X, Sparkles, Plus, ExternalLink, Search, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSubordinates } from "@/lib/hierarchy";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { gmailSync, gmailGet, gmailModify, gmailSend, emailAnalyze } from "@/server/gmail.functions";
import { AssociateDialog, type AssociateEntity } from "@/components/AssociateDialog";
import { toast } from "sonner";

type EmailRow = {
  id: string;
  gmail_id: string;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
  labels: string[] | null;
  is_unread: boolean;
  lead_id: string | null;
  customer_id: string | null;
};

type Folder = "inbox" | "unread" | "sent" | "trash" | "withLead";
type FullMessage = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof gmailGet>>>>;

export type EmailPanelProps = {
  mode: "full" | "lead";
  leadId?: string;
  customerId?: string | null;
  /** Optional explicit height (e.g. for embedding inside a card). Defaults to viewport-style for full mode. */
  className?: string;
};

export function EmailPanel({ mode, leadId, customerId, className }: EmailPanelProps) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { subordinates } = useSubordinates();

  const syncFn = useServerFn(gmailSync);
  const getFn = useServerFn(gmailGet);
  const modifyFn = useServerFn(gmailModify);
  const sendFn = useServerFn(gmailSend);
  const analyzeFn = useServerFn(emailAnalyze);

  const [folder, setFolder] = useState<Folder>(mode === "lead" ? "withLead" : "inbox");
  const [search, setSearch] = useState("");
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<FullMessage | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [showCompose, setShowCompose] = useState<null | "reply" | "forward">(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: "", email: "", phone: "", destination: "",
    estimated_value: "", currency: "BRL",
    expected_travel_date: "", notes: "", next_action: "",
    status: "novo",
    create_customer: true,
    assigned_to: "",
  });
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Triagem com IA
  type Triage = {
    summary: string;
    suggested_action: "create_lead" | "create_task" | "ignore";
    suggested_task_category?: "negocio" | "suporte" | null;
    suggested_task_priority?: "baixa" | "media" | "alta" | null;
    suggested_task_title?: string | null;
    raw: Record<string, unknown>;
  };
  const [triageOpen, setTriageOpen] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);

  // Suggested links based on sender email
  type Suggestion =
    | { kind: "lead"; id: string; label: string; sub?: string }
    | { kind: "customer"; id: string; label: string; sub?: string }
    | { kind: "supplier"; id: string; label: string; sub?: string };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Diálogo de criação de atividade
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    category: "suporte" as "negocio" | "suporte",
    priority: "media" as "baixa" | "media" | "alta",
    description: "",
    due_date: "",
    assigned_to: "",
  });
  const [associateOpen, setAssociateOpen] = useState(false);

  // ---------------- list loading ----------------
  const loadList = async (f: Folder = folder) => {
    let query = supabase.from("emails").select("*").order("received_at", { ascending: false }).limit(200);
    if (mode === "lead" && leadId) {
      query = query.eq("lead_id", leadId);
    } else {
      if (f === "unread") query = query.eq("is_unread", true);
      if (f === "sent") query = query.contains("labels", ["SENT"]);
      if (f === "trash") query = query.contains("labels", ["TRASH"]);
      if (f === "inbox") query = query.contains("labels", ["INBOX"]);
      if (f === "withLead") query = query.not("lead_id", "is", null);
    }
    const { data, error } = await query;
    if (error) { toast.error(error.message); return; }
    setEmails((data ?? []) as EmailRow[]);
  };

  useEffect(() => {
    void loadList(folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, leadId, mode]);

  useEffect(() => {
    if (mode === "full") void doSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSync = async () => {
    setSyncing(true);
    try {
      const res = await syncFn({ data: { q: "in:inbox", maxResults: 50 } });
      toast.success(`${res.synced} e-mails`);
      await loadList(folder);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  // ---------------- selection ----------------
  const select = async (row: EmailRow) => {
    setSelectedId(row.id);
    setFull(null);
    setLoadingBody(true);
    setShowCompose(null);
    try {
      const m = await getFn({ data: { id: row.gmail_id } });
      setFull(m);
      if (row.is_unread) {
        try {
          await modifyFn({ data: { id: row.gmail_id, removeLabelIds: ["UNREAD"] } });
          await supabase.from("emails").update({ is_unread: false }).eq("id", row.id);
          setEmails((prev) => prev.map((e) => (e.id === row.id ? { ...e, is_unread: false } : e)));
        } catch (e) { console.error(e); }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoadingBody(false);
    }
  };

  const selected = useMemo(() => emails.find((e) => e.id === selectedId) ?? null, [emails, selectedId]);

  // Load suggestions whenever selected email changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected?.from_email) { setSuggestions([]); return; }
      const email = selected.from_email.toLowerCase();
      const [{ data: leadRows }, { data: custRows }, { data: supRows }] = await Promise.all([
        supabase.from("leads").select("id,name,email,destination").ilike("email", email).limit(5),
        supabase.from("customers").select("id,full_name,email,phone").ilike("email", email).limit(5),
        supabase.from("suppliers").select("id,name,email,category").ilike("email", email).limit(5),
      ]);
      if (cancelled) return;
      const out: Suggestion[] = [
        ...((leadRows ?? []) as { id: string; name: string; destination: string | null }[]).map(
          (l) => ({ kind: "lead" as const, id: l.id, label: l.name, sub: l.destination ?? undefined }),
        ),
        ...((custRows ?? []) as { id: string; full_name: string; phone: string | null }[]).map(
          (c) => ({ kind: "customer" as const, id: c.id, label: c.full_name, sub: c.phone ?? undefined }),
        ),
        ...((supRows ?? []) as { id: string; name: string; category: string | null }[]).map(
          (s) => ({ kind: "supplier" as const, id: s.id, label: s.name, sub: s.category ?? undefined }),
        ),
      ];
      setSuggestions(out);
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const linkSuggestion = async (s: Suggestion) => {
    if (!selected) return;
    const patch: { lead_id?: string | null; customer_id?: string | null; supplier_id?: string | null } = {};
    if (s.kind === "lead") patch.lead_id = s.id;
    if (s.kind === "customer") patch.customer_id = s.id;
    if (s.kind === "supplier") patch.supplier_id = s.id;
    const { error } = await supabase.from("emails").update(patch).eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("emailLinked"));
    await loadList(folder);
  };

  const associatePick = async (e: AssociateEntity) => {
    if (!selected) return;
    const patch: { lead_id?: string | null; customer_id?: string | null; supplier_id?: string | null } = {};
    if (e.kind === "lead") { patch.lead_id = e.lead_id; if (e.customer_id) patch.customer_id = e.customer_id; }
    else if (e.kind === "customer") { patch.customer_id = e.customer_id; }
    else if (e.kind === "supplier") { patch.supplier_id = e.supplier_id; }
    else if (e.kind === "quote" || e.kind === "booking") {
      if (e.lead_id) patch.lead_id = e.lead_id;
      if (e.customer_id) patch.customer_id = e.customer_id;
    }
    const { error } = await supabase.from("emails").update(patch).eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("emailLinked"));
    await loadList(folder);
  };

  // ---------------- actions ----------------
  const archive = async () => {
    if (!selected) return;
    try {
      await modifyFn({ data: { id: selected.gmail_id, removeLabelIds: ["INBOX"] } });
      toast.success("OK");
      await loadList(folder);
      setSelectedId(null); setFull(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const trashIt = async () => {
    if (!selected) return;
    try {
      await modifyFn({ data: { id: selected.gmail_id, trash: true } });
      toast.success("OK");
      await loadList(folder);
      setSelectedId(null); setFull(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const toggleRead = async () => {
    if (!selected) return;
    const wasUnread = selected.is_unread;
    try {
      await modifyFn({
        data: {
          id: selected.gmail_id,
          addLabelIds: wasUnread ? [] : ["UNREAD"],
          removeLabelIds: wasUnread ? ["UNREAD"] : [],
        },
      });
      await supabase.from("emails").update({ is_unread: !wasUnread }).eq("id", selected.id);
      setEmails((prev) => prev.map((e) => (e.id === selected.id ? { ...e, is_unread: !wasUnread } : e)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const linkToLead = async () => {
    if (!selected || !leadId) return;
    const { error } = await supabase
      .from("emails")
      .update({ lead_id: leadId, customer_id: customerId ?? null })
      .eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("emailLinked"));
    await loadList(folder);
  };

  const openReply = () => {
    if (!full) return;
    setComposeTo(full.from.email || "");
    setComposeSubject(full.subject?.startsWith("Re:") ? full.subject : `Re: ${full.subject ?? ""}`);
    setComposeBody(`\n\n--- ${full.from.name || full.from.email} ${full.date ? `(${full.date})` : ""} ---\n${full.bodyText || ""}`);
    setShowCompose("reply");
  };
  const openForward = () => {
    if (!full) return;
    setComposeTo("");
    setComposeSubject(full.subject?.startsWith("Fwd:") ? full.subject : `Fwd: ${full.subject ?? ""}`);
    setComposeBody(`\n\n--- ${full.from.name || full.from.email} ${full.date ? `(${full.date})` : ""} ---\n${full.bodyText || ""}`);
    setShowCompose("forward");
  };

  const sendCompose = async () => {
    if (!full) return;
    if (!composeTo.trim()) { toast.error("To?"); return; }
    setSending(true);
    try {
      await sendFn({
        data: {
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
          threadId: showCompose === "reply" ? full.threadId : undefined,
          inReplyTo: showCompose === "reply" ? full.messageIdHeader ?? undefined : undefined,
          references: showCompose === "reply"
            ? [full.references, full.messageIdHeader].filter(Boolean).join(" ")
            : undefined,
        },
      });
      toast.success(t("replySent"));
      // Always log interaction in lead mode (auto-association)
      const ctxLeadId = mode === "lead" ? leadId : (selected?.lead_id ?? null);
      const ctxCustomerId = mode === "lead" ? (customerId ?? null) : (selected?.customer_id ?? null);
      if (ctxLeadId || ctxCustomerId) {
        await supabase.from("interactions").insert({
          type: "email",
          subject: composeSubject,
          content: composeBody,
          customer_id: ctxCustomerId,
          lead_id: ctxLeadId,
          created_by: user?.id ?? null,
        });
      }
      setShowCompose(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSending(false);
    }
  };

  // ---------------- AI / Lead create ----------------
  const openLeadDialog = (prefill?: Partial<typeof leadForm>, note?: string | null) => {
    if (!selected) return;
    setLeadForm({
      name: prefill?.name ?? selected.from_name ?? "",
      email: prefill?.email ?? selected.from_email ?? "",
      phone: prefill?.phone ?? "",
      destination: prefill?.destination ?? "",
      estimated_value: prefill?.estimated_value ?? "",
      currency: prefill?.currency ?? "BRL",
      expected_travel_date: prefill?.expected_travel_date ?? "",
      notes: prefill?.notes ?? selected.subject ?? "",
      next_action: prefill?.next_action ?? "",
      status: "novo",
      create_customer: true,
      assigned_to: prefill?.assigned_to ?? "",
    });
    setAiNote(note ?? null);
    setAiOpen(true);
  };

  const analyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const r = await analyzeFn({ data: { gmail_id: selected.gmail_id } });
      const s = (r.suggestion ?? {}) as Record<string, unknown>;
      setTriage({
        summary: (s.summary as string) || (s.notes as string) || selected.snippet || "",
        suggested_action: ((s.suggested_action as string) as Triage["suggested_action"])
          || ((s.is_lead as boolean) ? "create_lead" : "create_task"),
        suggested_task_category: (s.suggested_task_category as Triage["suggested_task_category"]) ?? "suporte",
        suggested_task_priority: (s.suggested_task_priority as Triage["suggested_task_priority"]) ?? "media",
        suggested_task_title: (s.suggested_task_title as string) || selected.subject || "",
        raw: s,
      });
      setTriageOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAnalyzing(false);
    }
  };

  const openLeadFromTriage = () => {
    if (!selected || !triage) return;
    const s = triage.raw;
    setTriageOpen(false);
    openLeadDialog(
      {
        name: (s.customer_name as string) || selected.from_name || "",
        email: (s.customer_email as string) || selected.from_email || "",
        phone: (s.customer_phone as string) || "",
        destination: (s.destination as string) || "",
        estimated_value: s.estimated_value != null ? String(s.estimated_value) : "",
        currency: (s.currency as string) || "BRL",
        expected_travel_date: (s.expected_travel_date as string) || "",
        notes: triage.summary || (s.notes as string) || selected.subject || "",
        next_action: (s.next_action as string) || "",
      },
      null,
    );
  };

  const openTaskDialog = (prefill?: Partial<typeof taskForm>) => {
    if (!selected) return;
    setTaskForm({
      title: prefill?.title ?? selected.subject ?? "",
      category: prefill?.category ?? "suporte",
      priority: prefill?.priority ?? "media",
      description: prefill?.description ?? selected.snippet ?? "",
      due_date: prefill?.due_date ?? "",
      assigned_to: prefill?.assigned_to ?? "",
    });
    setTriageOpen(false);
    setTaskOpen(true);
  };

  const openTaskFromTriage = () => {
    if (!triage) return;
    openTaskDialog({
      title: triage.suggested_task_title || selected?.subject || "",
      category: triage.suggested_task_category ?? "suporte",
      priority: triage.suggested_task_priority ?? "media",
      description: triage.summary,
    });
  };

  const saveTask = async () => {
    if (!selected || !user) return;
    try {
      const { error } = await supabase.from("tasks").insert({
        title: taskForm.title || selected.subject || "(sem assunto)",
        description: taskForm.description || null,
        category: taskForm.category,
        priority: taskForm.priority,
        source: "email",
        email_id: selected.id,
        lead_id: selected.lead_id,
        customer_id: selected.customer_id,
        due_date: taskForm.due_date || null,
        created_by: user.id,
        assigned_to: user.id,
      });
      if (error) throw error;
      toast.success(t("taskCreated"));
      setTaskOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const saveLead = async () => {
    if (!selected || !user) return;
    try {
      let cId: string | null = null;
      if (leadForm.create_customer && leadForm.email) {
        const { data: existing } = await supabase
          .from("customers").select("id").eq("email", leadForm.email).maybeSingle();
        if (existing?.id) cId = existing.id;
        else {
          const { data: created, error: cErr } = await supabase
            .from("customers")
            .insert({
              full_name: leadForm.name || leadForm.email,
              email: leadForm.email || null,
              phone: leadForm.phone || null,
              created_by: user.id,
            })
            .select("id").single();
          if (cErr) throw cErr;
          cId = created!.id;
        }
      }
      const { data: lead, error: lErr } = await supabase
        .from("leads")
        .insert({
          name: leadForm.name || leadForm.email || "—",
          email: leadForm.email || null,
          phone: leadForm.phone || null,
          destination: leadForm.destination || null,
          estimated_value: leadForm.estimated_value ? Number(leadForm.estimated_value) : null,
          currency: leadForm.currency as "BRL",
          expected_travel_date: leadForm.expected_travel_date || null,
          notes: leadForm.notes || null,
          next_action: leadForm.next_action || null,
          source: "email",
          status: leadForm.status as "novo",
          customer_id: cId,
          created_by: user.id,
          assigned_to: leadForm.assigned_to || user.id,
        })
        .select("id").single();
      if (lErr) throw lErr;

      await supabase.from("interactions").insert({
        type: "email",
        subject: selected.subject || "(sem assunto)",
        content: selected.snippet || "",
        lead_id: lead!.id,
        customer_id: cId,
        created_by: user.id,
      });
      await supabase.from("emails").update({ lead_id: lead!.id, customer_id: cId }).eq("id", selected.id);
      toast.success(t("leadCreated"));
      setAiOpen(false);
      await loadList(folder);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const filteredEmails = useMemo(() => {
    if (!search.trim()) return emails;
    const s = search.toLowerCase();
    return emails.filter(
      (e) =>
        (e.subject ?? "").toLowerCase().includes(s) ||
        (e.from_email ?? "").toLowerCase().includes(s) ||
        (e.from_name ?? "").toLowerCase().includes(s) ||
        (e.snippet ?? "").toLowerCase().includes(s),
    );
  }, [emails, search]);

  const localeForDate = lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US";

  // Layout differs slightly per mode
  const containerHeight = className ?? (mode === "lead" ? "h-[600px]" : "h-[calc(100vh-8rem)]");
  // In lead mode: 2 columns (list + viewer). In full mode: 3 columns (folders + list + viewer).
  const gridCols = mode === "lead" ? "grid-cols-12" : "grid-cols-12";

  return (
    <div className={`grid gap-3 ${containerHeight} ${gridCols}`}>
      {mode === "full" && (
        <Card className="col-span-2 overflow-hidden p-2">
          <div className="space-y-1">
            {([
              ["inbox", t("inbox")],
              ["unread", t("unread")],
              ["sent", t("sent")],
              ["trash", t("trash")],
              ["withLead", t("withLead")],
            ] as [Folder, string][]).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => { setFolder(k); setSelectedId(null); setFull(null); }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  folder === k ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent/50"
                }`}
              >
                <Mail className="h-4 w-4" />
                {lbl}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t pt-3">
            <Button size="sm" className="w-full" onClick={doSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? t("syncing") : t("sync")}
            </Button>
          </div>
        </Card>
      )}

      <Card className={`${mode === "full" ? "col-span-4" : "col-span-5"} flex flex-col overflow-hidden`}>
        <div className="border-b p-2 flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {mode === "lead" && (
            <Button size="icon" variant="outline" onClick={doSync} disabled={syncing} title={t("sync")}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("noEmailsYet")}</div>
          ) : (
            filteredEmails.map((e) => (
              <button
                key={e.id}
                onClick={() => select(e)}
                className={`flex w-full flex-col items-start gap-1 border-b px-3 py-3 text-left text-sm transition-colors ${
                  selectedId === e.id ? "bg-accent" : "hover:bg-accent/40"
                } ${e.is_unread ? "font-medium" : ""}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{e.from_name || e.from_email || "—"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {e.received_at ? new Date(e.received_at).toLocaleDateString(localeForDate) : ""}
                  </span>
                </div>
                <div className="w-full truncate">{e.subject || "(sem assunto)"}</div>
                <div className="flex w-full items-center gap-2">
                  <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">{e.snippet}</span>
                  {e.lead_id && <Badge variant="secondary" className="shrink-0">{t("leadLinked")}</Badge>}
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className={`${mode === "full" ? "col-span-6" : "col-span-7"} flex flex-col overflow-hidden`}>
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("selectEmail")}
          </div>
        ) : (
          <>
            <div className="border-b p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{selected.subject || "(sem assunto)"}</h2>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={toggleRead} title={selected.is_unread ? t("markRead") : t("markUnread")}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={archive} title={t("archive")}>
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={trashIt} title={t("moveToTrash")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {selected.from_name ? `${selected.from_name} · ` : ""}{selected.from_email}
              </div>
              {selected.lead_id && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Badge>{t("emailLinkedTo")} Lead</Badge>
                  {mode === "full" && (
                    <Link to="/leads" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {t("open")} <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
              {mode === "full" && !selected.lead_id && !selected.customer_id && suggestions.length > 0 && (
                <div className="mt-3 rounded-md border bg-muted/30 p-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Link2 className="h-3 w-3" /> {t("suggestedLinks")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <Button
                        key={`${s.kind}-${s.id}`}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => linkSuggestion(s)}
                        title={s.sub ?? ""}
                      >
                        <Badge variant="secondary" className="mr-1.5 px-1 text-[10px] uppercase">
                          {s.kind === "lead" ? "Lead" : s.kind === "customer" ? "Cliente" : "Forn."}
                        </Badge>
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={openReply}>
                  <Reply className="mr-2 h-4 w-4" /> {t("reply")}
                </Button>
                <Button size="sm" variant="outline" onClick={openForward}>
                  <Forward className="mr-2 h-4 w-4" /> {t("forward")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAssociateOpen(true)}>
                  <Link2 className="mr-2 h-4 w-4" /> {t("associate")}
                </Button>
                {mode === "lead" && leadId && !selected.lead_id && (
                  <Button size="sm" variant="secondary" onClick={linkToLead}>
                    <Link2 className="mr-2 h-4 w-4" /> {t("linkToThisLead")}
                  </Button>
                )}
                {mode === "full" && (
                  <>
                    <Button size="sm" onClick={analyze} disabled={analyzing}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {analyzing ? t("analyzing") : t("aiTriage")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openLeadDialog()}>
                      <Plus className="mr-2 h-4 w-4" /> {t("createLeadManual")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openTaskDialog()}>
                      <Plus className="mr-2 h-4 w-4" /> {t("createTaskManual")}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {loadingBody ? (
                <div className="text-sm text-muted-foreground">{t("bodyLoading")}</div>
              ) : full?.bodyHtml ? (
                <SanitizedHtml html={full.bodyHtml} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm">{full?.bodyText ?? ""}</pre>
              )}
            </div>

            {showCompose && (
              <div className="border-t bg-muted/40 p-3">
                <div className="space-y-2">
                  <Input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="To" />
                  <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Subject" />
                  <Textarea rows={6} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={sendCompose} disabled={sending}>
                      {sending ? t("sendingReply") : t("sendReply")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowCompose(null)}>
                      <X className="mr-1 h-4 w-4" /> {t("cancel")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> {t("createLead")}
            </DialogTitle>
          </DialogHeader>
          {aiNote && (
            <div className="rounded-md border border-muted bg-muted p-3 text-sm text-muted-foreground">
              {aiNote}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{t("name")}</Label>
              <Input value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} />
            </div>
            <div>
              <Label>{t("email")}</Label>
              <Input value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
            </div>
            <div>
              <Label>{t("phone")}</Label>
              <Input value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("destination")}</Label>
              <Input value={leadForm.destination} onChange={(e) => setLeadForm({ ...leadForm, destination: e.target.value })} />
            </div>
            <div>
              <Label>{t("expectedTravel")}</Label>
              <Input type="date" value={leadForm.expected_travel_date} onChange={(e) => setLeadForm({ ...leadForm, expected_travel_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("estimatedValue")}</Label>
              <Input type="number" step="0.01" value={leadForm.estimated_value} onChange={(e) => setLeadForm({ ...leadForm, estimated_value: e.target.value })} />
            </div>
            <div>
              <Label>{t("currency")}</Label>
              <Select value={leadForm.currency} onValueChange={(v) => setLeadForm({ ...leadForm, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>{t("nextAction")}</Label>
              <Input value={leadForm.next_action} onChange={(e) => setLeadForm({ ...leadForm, next_action: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>{t("notes")}</Label>
              <Textarea rows={3} value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} />
            </div>
            {subordinates.length > 0 && (
              <div className="col-span-2">
                <Label>Atribuir a</Label>
                <Select
                  value={leadForm.assigned_to || "self"}
                  onValueChange={(v) => setLeadForm({ ...leadForm, assigned_to: v === "self" ? "" : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Eu mesmo</SelectItem>
                    {subordinates.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="create_customer_panel"
                checked={leadForm.create_customer}
                onCheckedChange={(v) => setLeadForm({ ...leadForm, create_customer: v === true })}
              />
              <Label htmlFor="create_customer_panel" className="cursor-pointer font-normal">
                {t("createCustomer")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>{t("cancel")}</Button>
            <Button onClick={saveLead}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Triage dialog */}
      <Dialog open={triageOpen} onOpenChange={setTriageOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> {t("aiTriage")}
            </DialogTitle>
          </DialogHeader>
          {triage && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">{t("aiSummary")}</Label>
                <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {triage.summary || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("aiRecommendation")}:</span>
                <Badge>
                  {triage.suggested_action === "create_lead"
                    ? t("recCreateLead")
                    : triage.suggested_action === "create_task"
                    ? t("recCreateTask")
                    : t("recIgnore")}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setTriageOpen(false)}>
              {t("ignoreEmail")}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={openTaskFromTriage}>
                <Plus className="mr-2 h-4 w-4" /> {t("recCreateTask")}
              </Button>
              <Button onClick={openLeadFromTriage}>
                <Plus className="mr-2 h-4 w-4" /> {t("recCreateLead")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create activity dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> {t("createTaskFromEmail")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{t("taskTitle")}</Label>
              <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            </div>
            <div>
              <Label>{t("taskCategory")}</Label>
              <Select
                value={taskForm.category}
                onValueChange={(v) => setTaskForm({ ...taskForm, category: v as "negocio" | "suporte" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="negocio">{t("categoryBusiness")}</SelectItem>
                  <SelectItem value="suporte">{t("categorySupport")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("taskPriority")}</Label>
              <Select
                value={taskForm.priority}
                onValueChange={(v) => setTaskForm({ ...taskForm, priority: v as "baixa" | "media" | "alta" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">{t("priorityLow")}</SelectItem>
                  <SelectItem value="media">{t("priorityMedium")}</SelectItem>
                  <SelectItem value="alta">{t("priorityHigh")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>{t("taskDueDate")}</Label>
              <Input
                type="date"
                value={taskForm.due_date}
                onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>{t("taskDescription")}</Label>
              <Textarea
                rows={4}
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>{t("cancel")}</Button>
            <Button onClick={saveTask}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssociateDialog
        open={associateOpen}
        onOpenChange={setAssociateOpen}
        onPick={associatePick}
      />
    </div>
  );
}

function SanitizedHtml({ html }: { html: string }) {
  const safe = useMemo(() => {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/ on[a-z]+="[^"]*"/gi, "")
      .replace(/ on[a-z]+='[^']*'/gi, "")
      .replace(/javascript:/gi, "");
  }, [html]);
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: safe }} />;
}
