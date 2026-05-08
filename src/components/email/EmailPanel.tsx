import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Inbox, Send, FileText, AlertOctagon, Trash2, Star, Tag, RefreshCw, Search, Paperclip, Mail, ArrowLeft, Reply, Forward, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { gmailListLabels, gmailFullSync, gmailIncrementalSync, gmailGetThread, gmailGetAttachment } from "@/server/gmail-mirror.functions";
import { gmailSend } from "@/server/gmail.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Folder = { id: string; name: string; type: string; unread_count: number; total_count: number; color_bg: string | null; color_text: string | null };
type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; participants: string[];
  last_message_at: string | null; message_count: number;
  is_unread: boolean; is_starred: boolean; is_important: boolean; has_attachments: boolean;
  labels: string[];
};
type ThreadMessage = {
  id: string; labelIds: string[]; snippet: string;
  from: { name: string; email: string }; to: string[]; cc: string[]; subject: string;
  date: string | null; bodyHtml: string; bodyText: string; hasAttachments: boolean;
  attachments: Array<{ attachment_id: string; filename: string; mime_type: string; size: number }>;
  isUnread: boolean;
};

const SYSTEM_ORDER = ["INBOX", "STARRED", "IMPORTANT", "SENT", "DRAFT", "SPAM", "TRASH"];
const SYSTEM_ICONS: Record<string, any> = {
  INBOX: Inbox, STARRED: Star, IMPORTANT: AlertOctagon, SENT: Send, DRAFT: FileText, SPAM: AlertOctagon, TRASH: Trash2,
};
const SYSTEM_NAMES_PT: Record<string, string> = {
  INBOX: "Caixa de entrada", STARRED: "Com estrela", IMPORTANT: "Importante",
  SENT: "Enviados", DRAFT: "Rascunhos", SPAM: "Spam", TRASH: "Lixeira",
};
const CATEGORIES = [
  { id: "CATEGORY_PERSONAL", name: "Principal", short: "PRIMARY" },
  { id: "CATEGORY_SOCIAL", name: "Social", short: "SOCIAL" },
  { id: "CATEGORY_PROMOTIONS", name: "Promoções", short: "PROMOTIONS" },
  { id: "CATEGORY_UPDATES", name: "Atualizações", short: "UPDATES" },
];

function formatRelative(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: sameYear ? undefined : "2-digit" });
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type EmailPanelProps = {
  mode: "full" | "lead";
  leadId?: string;
  customerId?: string | null;
  className?: string;
};

export function EmailPanel({ mode, leadId, customerId: _customerId, className }: EmailPanelProps) {
  const { user } = useAuth();
  const listLabelsFn = useServerFn(gmailListLabels);
  const fullSyncFn = useServerFn(gmailFullSync);
  const incSyncFn = useServerFn(gmailIncrementalSync);
  const getThreadFn = useServerFn(gmailGetThread);
  const getAttachmentFn = useServerFn(gmailGetAttachment);
  const sendFn = useServerFn(gmailSend);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("INBOX");
  const [activeCategory, setActiveCategory] = useState<string>("CATEGORY_PERSONAL");
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[] | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState<null | { mode: "reply" | "forward" | "new"; msg?: ThreadMessage }>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // ---------- LOADERS ----------
  const loadFolders = useCallback(async () => {
    const { data } = await supabase.from("email_labels").select("*").order("name");
    setFolders((data ?? []) as Folder[]);
  }, []);

  const loadThreads = useCallback(async () => {
    let q = supabase.from("email_threads").select("*").order("last_message_at", { ascending: false }).limit(200);
    // filter by label
    if (activeLabel === "INBOX") {
      q = q.contains("labels", ["INBOX", activeCategory]);
    } else if (SYSTEM_ORDER.includes(activeLabel) || activeLabel.startsWith("Label_")) {
      q = q.contains("labels", [activeLabel]);
    } else {
      q = q.contains("labels", [activeLabel]);
    }
    if (search.trim()) {
      q = q.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
    }
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setThreads((data ?? []) as ThreadRow[]);
  }, [activeLabel, activeCategory, search]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel("email-mirror")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, () => loadThreads())
      .on("postgres_changes", { event: "*", schema: "public", table: "email_labels" }, () => loadFolders())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [loadThreads, loadFolders]);

  // polling: incremental sync every 30s when visible
  const incRef = useRef(incSyncFn);
  incRef.current = incSyncFn;
  useEffect(() => {
    if (mode !== "full") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await incRef.current({ data: undefined as any });
        if ((r as any)?.needsFullSync) return; // ignore silently
      } catch (e) { /* silent */ }
    };
    timer = setInterval(tick, 30_000);
    void tick();
    const onVisibility = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [mode]);

  // ---------- ACTIONS ----------
  const doFullSync = async () => {
    setSyncing(true);
    try {
      await listLabelsFn({ data: undefined as any });
      const r = await fullSyncFn({ data: { maxPerLabel: 300 } });
      toast.success(`${r.synced} mensagens, ${r.threads} conversas`);
      await loadFolders();
      await loadThreads();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao sincronizar";
      if (msg.includes("project_not_authorized") || msg.includes("GOOGLE_MAIL_API_KEY")) {
        toast.info("Nenhuma conta Gmail conectada");
      } else toast.error(msg);
    } finally { setSyncing(false); }
  };

  const openThread = async (t: ThreadRow) => {
    setSelectedThreadId(t.id);
    setThreadMessages(null);
    setLoadingThread(true);
    try {
      const r = await getThreadFn({ data: { threadId: t.id } });
      setThreadMessages(r.messages as ThreadMessage[]);
      // marcar local como lida
      if (t.is_unread) {
        await supabase.from("email_threads").update({ is_unread: false }).eq("id", t.id);
        await supabase.from("emails").update({ is_unread: false }).eq("thread_id", t.id);
        setThreads((prev) => prev.map((x) => x.id === t.id ? { ...x, is_unread: false } : x));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar conversa");
    } finally { setLoadingThread(false); }
  };

  const downloadAttachment = async (msgId: string, att: { attachment_id: string; filename: string; mime_type: string }) => {
    try {
      const r = await getAttachmentFn({ data: { messageId: msgId, attachmentId: att.attachment_id } });
      const b64 = r.dataB64Url.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
      const bin = atob(b64 + pad);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: att.mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = att.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const localStar = async (t: ThreadRow) => {
    const next = !t.is_starred;
    await supabase.from("email_threads").update({ is_starred: next }).eq("id", t.id);
    await supabase.from("emails").update({ is_starred: next }).eq("thread_id", t.id);
    setThreads((prev) => prev.map((x) => x.id === t.id ? { ...x, is_starred: next } : x));
  };
  const localArchive = async () => {
    if (!selectedThreadId) return;
    await supabase.from("email_threads").update({ labels: threads.find((t) => t.id === selectedThreadId)!.labels.filter((l) => l !== "INBOX") }).eq("id", selectedThreadId);
    setSelectedThreadId(null); setThreadMessages(null);
    await loadThreads();
  };
  const localTrash = async () => {
    if (!selectedThreadId) return;
    const t = threads.find((x) => x.id === selectedThreadId)!;
    const labs = Array.from(new Set([...t.labels.filter((l) => l !== "INBOX"), "TRASH"]));
    await supabase.from("email_threads").update({ labels: labs }).eq("id", selectedThreadId);
    await supabase.from("emails").update({ labels: labs }).eq("thread_id", selectedThreadId);
    setSelectedThreadId(null); setThreadMessages(null);
    await loadThreads();
  };

  const openCompose = (m: ThreadMessage, kind: "reply" | "forward") => {
    setComposeTo(kind === "reply" ? m.from.email : "");
    setComposeSubject(kind === "reply" ? (m.subject?.startsWith("Re:") ? m.subject : `Re: ${m.subject}`) : (m.subject?.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject}`));
    setComposeBody(`\n\n--- ${m.from.name || m.from.email} ${m.date ? `(${formatRelative(m.date)})` : ""} ---\n${m.bodyText || ""}`);
    setComposeOpen({ mode: kind, msg: m });
  };
  const sendCompose = async () => {
    if (!composeOpen?.msg) return;
    if (!composeTo.trim()) { toast.error("Destinatário?"); return; }
    setSending(true);
    try {
      await sendFn({ data: { to: composeTo, subject: composeSubject, body: composeBody, threadId: composeOpen.mode === "reply" ? composeOpen.msg.id : undefined } });
      toast.success("Enviado");
      setComposeOpen(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSending(false); }
  };

  // ---------- DERIVED ----------
  const sidebarSystem = useMemo(() => SYSTEM_ORDER.map((id) => folders.find((f) => f.id === id)).filter(Boolean) as Folder[], [folders]);
  const sidebarUser = useMemo(() => folders.filter((f) => f.type === "user").sort((a, b) => a.name.localeCompare(b.name)), [folders]);

  const selected = threads.find((t) => t.id === selectedThreadId) ?? null;

  // ---------- LEAD MODE ----------
  if (mode === "lead" && leadId) {
    return <LeadEmailMini leadId={leadId} className={className} />;
  }

  // ---------- RENDER ----------
  return (
    <div className={cn("flex h-[calc(100vh-4rem)] bg-background", className)}>
      {/* SIDEBAR */}
      <aside className="w-60 shrink-0 border-r flex flex-col">
        <div className="p-3 border-b">
          <Button onClick={doFullSync} disabled={syncing} className="w-full justify-start gap-2" variant="default">
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Sincronizar Gmail"}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-0.5">
            {sidebarSystem.map((f) => {
              const Icon = SYSTEM_ICONS[f.id] ?? Mail;
              const active = activeLabel === f.id;
              return (
                <button key={f.id}
                  onClick={() => { setActiveLabel(f.id); setSelectedThreadId(null); setThreadMessages(null); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-r-full text-sm transition-colors",
                    active ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted text-foreground/80")}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{SYSTEM_NAMES_PT[f.id] ?? f.name}</span>
                  {f.unread_count > 0 && <span className="text-xs font-medium tabular-nums">{f.unread_count}</span>}
                </button>
              );
            })}
            {sidebarUser.length > 0 && <>
              <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Marcadores</div>
              {sidebarUser.map((f) => {
                const active = activeLabel === f.id;
                return (
                  <button key={f.id}
                    onClick={() => { setActiveLabel(f.id); setSelectedThreadId(null); setThreadMessages(null); }}
                    className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-r-full text-sm transition-colors",
                      active ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted text-foreground/80")}>
                    <Tag className="h-4 w-4 shrink-0" style={f.color_bg ? { color: f.color_bg } : undefined} />
                    <span className="flex-1 text-left truncate">{f.name}</span>
                    {f.unread_count > 0 && <span className="text-xs font-medium tabular-nums">{f.unread_count}</span>}
                  </button>
                );
              })}
            </>}
          </nav>
        </ScrollArea>
      </aside>

      {/* THREAD LIST */}
      <section className={cn("border-r flex flex-col", selectedThreadId ? "hidden lg:flex w-[26rem]" : "flex flex-1 lg:flex-none lg:w-[26rem]")}>
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar e-mails" className="pl-9" />
          </div>
          {activeLabel === "INBOX" && (
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>
              <TabsList className="w-full grid grid-cols-4 h-8">
                {CATEGORIES.map((c) => <TabsTrigger key={c.id} value={c.id} className="text-xs">{c.name}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          )}
        </div>
        <ScrollArea className="flex-1">
          {threads.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma conversa</div>
          ) : threads.map((t) => (
            <button key={t.id} onClick={() => void openThread(t)}
              className={cn("w-full text-left px-3 py-2.5 border-b transition-colors flex gap-2",
                selectedThreadId === t.id ? "bg-primary/10" : "hover:bg-muted/50",
                t.is_unread && "bg-card font-medium")}>
              <button onClick={(e) => { e.stopPropagation(); void localStar(t); }} className="shrink-0 mt-0.5">
                <Star className={cn("h-4 w-4", t.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className={cn("text-sm truncate flex-1", t.is_unread && "font-semibold")}>
                    {t.participants.slice(0, 2).join(", ")}{t.message_count > 1 && <span className="text-muted-foreground"> ({t.message_count})</span>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{formatRelative(t.last_message_at)}</div>
                </div>
                <div className="text-sm truncate">{t.subject || "(sem assunto)"}</div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  {t.has_attachments && <Paperclip className="h-3 w-3" />}
                  <span className="truncate">{t.snippet}</span>
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </section>

      {/* READER */}
      <section className={cn("flex-1 flex flex-col min-w-0", !selectedThreadId && "hidden lg:flex")}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b p-3 flex items-center gap-2">
              <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setSelectedThreadId(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold flex-1 truncate">{selected.subject || "(sem assunto)"}</h2>
              <Button size="icon" variant="ghost" onClick={localArchive} title="Arquivar (local)"><Archive className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={localTrash} title="Lixeira (local)"><Trash2 className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => void localStar(selected)} title="Estrela">
                <Star className={cn("h-4 w-4", selected.is_starred && "fill-yellow-400 text-yellow-400")} />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3 max-w-4xl mx-auto">
                {loadingThread && <div className="text-sm text-muted-foreground">Carregando…</div>}
                {threadMessages?.map((m, idx) => {
                  const isLast = idx === threadMessages.length - 1;
                  return (
                    <article key={m.id} className="border rounded-lg overflow-hidden bg-card">
                      <header className="px-4 py-3 border-b flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0">
                          {(m.from.name || m.from.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <div className="font-semibold text-sm truncate">{m.from.name || m.from.email}</div>
                            <div className="text-xs text-muted-foreground truncate">&lt;{m.from.email}&gt;</div>
                            <div className="text-xs text-muted-foreground ml-auto shrink-0">{formatRelative(m.date)}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">para {m.to.join(", ") || "—"}{m.cc.length ? ` · cc ${m.cc.join(", ")}` : ""}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openCompose(m, "reply")}><Reply className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => openCompose(m, "forward")}><Forward className="h-4 w-4" /></Button>
                        </div>
                      </header>
                      <div className="p-4">
                        {m.bodyHtml ? (
                          <iframe srcDoc={m.bodyHtml} sandbox="" className="w-full min-h-[200px] border-0" title={`msg-${m.id}`} />
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm font-sans">{m.bodyText || m.snippet}</pre>
                        )}
                        {m.attachments.length > 0 && (
                          <>
                            <Separator className="my-3" />
                            <div className="flex flex-wrap gap-2">
                              {m.attachments.map((a) => (
                                <button key={a.attachment_id} onClick={() => void downloadAttachment(m.id, a)}
                                  className="flex items-center gap-2 px-3 py-2 rounded border hover:bg-muted text-sm">
                                  <Paperclip className="h-4 w-4" />
                                  <span className="truncate max-w-[14rem]">{a.filename}</span>
                                  <span className="text-xs text-muted-foreground">{bytes(a.size)}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </section>

      {/* COMPOSE */}
      <Dialog open={!!composeOpen} onOpenChange={(o) => !o && setComposeOpen(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{composeOpen?.mode === "reply" ? "Responder" : "Encaminhar"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Para</Label><Input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} /></div>
            <div><Label>Assunto</Label><Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} /></div>
            <div><Label>Mensagem</Label><Textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={10} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(null)}>Cancelar</Button>
            <Button onClick={sendCompose} disabled={sending}>{sending ? "Enviando…" : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Stub mínimo para modo lead (mantém comportamento antigo simples)
function LeadEmailMini({ leadId, className }: { leadId: string; className?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    void supabase.from("emails").select("*").eq("lead_id", leadId).order("internal_date", { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
  }, [leadId]);
  return (
    <div className={cn("p-3 space-y-2", className)}>
      {rows.length === 0 && <div className="text-sm text-muted-foreground">Nenhum e-mail vinculado.</div>}
      {rows.map((r) => (
        <div key={r.id} className="border rounded p-3">
          <div className="text-xs text-muted-foreground">{r.from_name || r.from_email} · {formatRelative(r.internal_date || r.received_at)}</div>
          <div className="font-medium text-sm">{r.subject}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">{r.snippet}</div>
        </div>
      ))}
    </div>
  );
}
