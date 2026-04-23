import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Mail, RefreshCw, Reply, Forward, Archive, Trash2, Check, X, Sparkles, Plus, ExternalLink, Search,
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
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
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { gmailSync, gmailGet, gmailModify, gmailSend, emailAnalyze } from "@/server/gmail.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/email")({
  component: () => (
    <AuthGate>
      <AppShell>
        <EmailPage />
      </AppShell>
    </AuthGate>
  ),
});

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

function EmailPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const syncFn = useServerFn(gmailSync);
  const getFn = useServerFn(gmailGet);
  const modifyFn = useServerFn(gmailModify);
  const sendFn = useServerFn(gmailSend);
  const analyzeFn = useServerFn(emailAnalyze);

  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<FullMessage | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // composer
  const [showCompose, setShowCompose] = useState<null | "reply" | "forward">(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // ai dialog
  const [aiOpen, setAiOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: "", email: "", phone: "", destination: "",
    estimated_value: "", currency: "BRL",
    expected_travel_date: "", notes: "", next_action: "",
    status: "novo",
    create_customer: true,
  });
  const [aiNote, setAiNote] = useState<string | null>(null);

  // ---------------- load list ----------------
  const loadList = async (f: Folder = folder) => {
    let query = supabase.from("emails").select("*").order("received_at", { ascending: false }).limit(200);
    if (f === "unread") query = query.eq("is_unread", true);
    if (f === "sent") query = query.contains("labels", ["SENT"]);
    if (f === "trash") query = query.contains("labels", ["TRASH"]);
    if (f === "inbox") query = query.contains("labels", ["INBOX"]);
    if (f === "withLead") query = query.not("lead_id", "is", null);
    const { data, error } = await query;
    if (error) { toast.error(error.message); return; }
    setEmails((data ?? []) as EmailRow[]);
  };

  useEffect(() => { loadList(folder); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder]);

  // initial sync on mount
  useEffect(() => {
    void doSync();
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
      // Mark as read locally + via Gmail
      if (row.is_unread) {
        try {
          await modifyFn({ data: { id: row.gmail_id, removeLabelIds: ["UNREAD"] } });
          await supabase.from("emails").update({ is_unread: false }).eq("id", row.id);
          setEmails((prev) => prev.map((e) => (e.id === row.id ? { ...e, is_unread: false } : e)));
        } catch (e) {
          console.error(e);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoadingBody(false);
    }
  };

  const selected = useMemo(() => emails.find((e) => e.id === selectedId) ?? null, [emails, selectedId]);

  // ---------------- actions ----------------
  const archive = async () => {
    if (!selected) return;
    try {
      await modifyFn({ data: { id: selected.gmail_id, removeLabelIds: ["INBOX"] } });
      toast.success("OK");
      await loadList(folder);
      setSelectedId(null);
      setFull(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const trashIt = async () => {
    if (!selected) return;
    try {
      await modifyFn({ data: { id: selected.gmail_id, trash: true } });
      toast.success("OK");
      await loadList(folder);
      setSelectedId(null);
      setFull(null);
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
      // log interaction
      if (selected?.customer_id || selected?.lead_id) {
        await supabase.from("interactions").insert({
          type: "email",
          subject: composeSubject,
          content: composeBody,
          customer_id: selected?.customer_id ?? null,
          lead_id: selected?.lead_id ?? null,
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

  // ---------------- AI / Lead ----------------
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
      const isLead = (s.is_lead as boolean | undefined) ?? false;
      if (!isLead) {
        toast.message(t("notALead"));
      }
      openLeadDialog(
        {
          name: (s.customer_name as string) || selected.from_name || "",
          email: (s.customer_email as string) || selected.from_email || "",
          phone: (s.customer_phone as string) || "",
          destination: (s.destination as string) || "",
          estimated_value: s.estimated_value != null ? String(s.estimated_value) : "",
          currency: (s.currency as string) || "BRL",
          expected_travel_date: (s.expected_travel_date as string) || "",
          notes: (s.notes as string) || selected.subject || "",
          next_action: (s.next_action as string) || "",
        },
        isLead ? null : t("notALead"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveLead = async () => {
    if (!selected || !user) return;
    try {
      let customerId: string | null = null;
      if (leadForm.create_customer && leadForm.email) {
        // try find existing
        const { data: existing } = await supabase
          .from("customers").select("id").eq("email", leadForm.email).maybeSingle();
        if (existing?.id) customerId = existing.id;
        else {
          const { data: created, error: cErr } = await supabase
            .from("customers")
            .insert({
              full_name: leadForm.name || leadForm.email,
              email: leadForm.email || null,
              phone: leadForm.phone || null,
              created_by: user.id,
            })
            .select("id")
            .single();
          if (cErr) throw cErr;
          customerId = created!.id;
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
          customer_id: customerId,
          created_by: user.id,
          assigned_to: user.id,
        })
        .select("id")
        .single();
      if (lErr) throw lErr;

      // interaction
      await supabase.from("interactions").insert({
        type: "email",
        subject: selected.subject || "(sem assunto)",
        content: selected.snippet || "",
        lead_id: lead!.id,
        customer_id: customerId,
        created_by: user.id,
      });

      // link email
      await supabase.from("emails").update({ lead_id: lead!.id, customer_id: customerId }).eq("id", selected.id);

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

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-12 gap-4">
      {/* Folders */}
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

      {/* List */}
      <Card className="col-span-4 flex flex-col overflow-hidden">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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

      {/* Viewer */}
      <Card className="col-span-6 flex flex-col overflow-hidden">
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
                  <Link to="/leads" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {t("open")} <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={openReply}>
                  <Reply className="mr-2 h-4 w-4" /> {t("reply")}
                </Button>
                <Button size="sm" variant="outline" onClick={openForward}>
                  <Forward className="mr-2 h-4 w-4" /> {t("forward")}
                </Button>
                <Button size="sm" onClick={analyze} disabled={analyzing}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {analyzing ? t("analyzing") : `${t("analyzeAi")} → ${t("createLead")}`}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openLeadDialog()}>
                  <Plus className="mr-2 h-4 w-4" /> {t("createLeadManual")}
                </Button>
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

      {/* Lead Dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> {t("createLead")}
            </DialogTitle>
          </DialogHeader>
          {aiNote && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
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
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="create_customer"
                checked={leadForm.create_customer}
                onCheckedChange={(v) => setLeadForm({ ...leadForm, create_customer: v === true })}
              />
              <Label htmlFor="create_customer" className="cursor-pointer font-normal">
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
    </div>
  );
}

function SanitizedHtml({ html }: { html: string }) {
  // Basic sanitization: strip <script> and event handlers + inline javascript: URLs.
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
