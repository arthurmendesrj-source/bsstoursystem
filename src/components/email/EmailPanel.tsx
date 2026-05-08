import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Inbox, Send, FileText, AlertOctagon, Trash2, Star, Tag, RefreshCw, Search, Paperclip, Mail, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { gmailListLabels, gmailFullSync, gmailIncrementalSync, gmailGetThread, gmailGetAttachment } from "@/server/gmail-mirror.functions";
import { gmailSend } from "@/server/gmail.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThreadReader, type ThreadMessage } from "@/components/email/ThreadReader";

type Folder = { id: string; name: string; type: string; unread_count: number; total_count: number; color_bg: string | null; color_text: string | null };
type ThreadRow = {
  id: string; subject: string | null; snippet: string | null; participants: string[];
  last_message_at: string | null; message_count: number;
  is_unread: boolean; is_starred: boolean; is_important: boolean; has_attachments: boolean;
  labels: string[];
};

const SYSTEM_ORDER = ["INBOX", "STARRED", "IMPORTANT", "SENT", "DRAFT", "SPAM", "TRASH"];
const SYSTEM_ICONS: Record<string, typeof Inbox> = {
  INBOX: Inbox, STARRED: Star, IMPORTANT: AlertOctagon, SENT: Send, DRAFT: FileText, SPAM: AlertOctagon, TRASH: Trash2,
};
const SYSTEM_NAMES_PT: Record<string, string> = {
  INBOX: "Caixa de entrada", STARRED: "Com estrela", IMPORTANT: "Importante",
  SENT: "Enviados", DRAFT: "Rascunhos", SPAM: "Spam", TRASH: "Lixeira",
};
const LS_COLLAPSED = "email.sidebar.collapsed";

function formatRelative(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: sameYear ? undefined : "2-digit" });
}

export type EmailPanelProps = {
  mode: "full" | "lead";
  leadId?: string;
  customerId?: string | null;
  className?: string;
};

export function EmailPanel({ mode, leadId, customerId: _customerId, className }: EmailPanelProps) {
  const listLabelsFn = useServerFn(gmailListLabels);
  const fullSyncFn = useServerFn(gmailFullSync);
  const incSyncFn = useServerFn(gmailIncrementalSync);
  const getThreadFn = useServerFn(gmailGetThread);
  const getAttachmentFn = useServerFn(gmailGetAttachment);
  const sendFn = useServerFn(gmailSend);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("INBOX");
  
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

  // Popup independente
  const [popupThreadId, setPopupThreadId] = useState<string | null>(null);
  const [popupMessages, setPopupMessages] = useState<ThreadMessage[] | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);

  // sidebar collapsed
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_COLLAPSED) === "1";
  });
  useEffect(() => { try { localStorage.setItem(LS_COLLAPSED, collapsed ? "1" : "0"); } catch {} }, [collapsed]);


  const [authorizedEmails, setAuthorizedEmails] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { if (!cancelled) setAuthorizedEmails([]); return; }
      const { data } = await supabase.from("user_email_accounts").select("email_address").eq("user_id", uid);
      if (cancelled) return;
      setAuthorizedEmails(((data ?? []) as Array<{ email_address: string }>).map((r) => r.email_address.toLowerCase()));
    })();
    return () => { cancelled = true; };
  }, []);

  const hasMailbox = (authorizedEmails?.length ?? 0) > 0;

  const loadFolders = useCallback(async () => {
    if (!hasMailbox) { setFolders([]); return; }
    const { data } = await supabase.from("email_labels").select("*").in("owner_email", authorizedEmails!).order("name");
    setFolders((data ?? []) as Folder[]);
  }, [hasMailbox, authorizedEmails]);

  const loadThreads = useCallback(async () => {
    if (!hasMailbox) { setThreads([]); return; }
    const term = search.trim();
    let threadIdHits: string[] | null = null;
    if (term.length >= 2) {
      const safe = term.replace(/[%,()"\\]/g, " ").trim();
      if (safe) {
        const like = `%${safe}%`;
        const { data: hits } = await supabase
          .from("emails")
          .select("thread_id")
          .in("owner_email", authorizedEmails!)
          .or(`subject.ilike.${like},from_name.ilike.${like},from_email.ilike.${like},snippet.ilike.${like},body_text.ilike.${like}`)
          .limit(500);
        threadIdHits = Array.from(new Set(((hits ?? []) as Array<{ thread_id: string | null }>).map((h) => h.thread_id).filter((x): x is string => !!x)));
      }
    }
    let q = supabase.from("email_threads").select("*").in("owner_email", authorizedEmails!)
      .order("last_message_at", { ascending: false }).limit(200);
    q = q.contains("labels", [activeLabel]);
    if (term.length >= 2) {
      const safe = term.replace(/[%,()"\\]/g, " ").trim();
      const like = `%${safe}%`;
      const orParts = [`subject.ilike.${like}`, `snippet.ilike.${like}`];
      // partial match within participants array (server-side via PostgREST)
      orParts.push(`participants.cs.{${safe}}`);
      if (threadIdHits && threadIdHits.length) {
        orParts.push(`id.in.(${threadIdHits.map((id) => `"${id}"`).join(",")})`);
      }
      q = q.or(orParts.join(","));
    }
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setThreads((data ?? []) as ThreadRow[]);
  }, [activeLabel, search, hasMailbox, authorizedEmails]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Deep-link from global search: ?q=...&thread=...
  const pendingThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "full" || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const qParam = sp.get("q");
    const threadParam = sp.get("thread");
    if (qParam) setSearch(qParam);
    if (threadParam) pendingThreadRef.current = threadParam;
    if (qParam || threadParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("thread");
      window.history.replaceState({}, "", url.toString());
    }
  }, [mode]);

  useEffect(() => {
    const tid = pendingThreadRef.current;
    if (!tid || threads.length === 0) return;
    const match = threads.find((t) => t.id === tid);
    if (match) {
      pendingThreadRef.current = null;
      void openThread(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads]);

  useEffect(() => {
    const ch = supabase.channel("email-mirror")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, () => loadThreads())
      .on("postgres_changes", { event: "*", schema: "public", table: "email_labels" }, () => loadFolders())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [loadThreads, loadFolders]);

  const incRef = useRef(incSyncFn); incRef.current = incSyncFn;
  useEffect(() => {
    if (mode !== "full" || !hasMailbox) return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try { await incRef.current({ data: undefined as never }); } catch { /* silent */ }
    };
    const timer = setInterval(tick, 15_000);
    void tick();
    const onVisibility = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [mode, hasMailbox]);

  const doFullSync = async () => {
    setSyncing(true);
    let total = 0;
    const labelNames: Record<string, string> = {
      INBOX: "Caixa de entrada", SENT: "Enviados", DRAFT: "Rascunhos",
      SPAM: "Spam", TRASH: "Lixeira", IMPORTANT: "Importantes", STARRED: "Com estrela",
    };
    try {
      await listLabelsFn({ data: undefined as never });
      for (let i = 0; i < 400; i++) {
        const r = await fullSyncFn({ data: { restart: i === 0, windowDays: 180 } });
        total = r.totalSynced || total + r.syncedThisRun;
        const labelLabel = labelNames[r.label] ?? r.label;
        toast.message(`Sincronizando ${labelLabel}…`, { description: `${total} mensagens, ${r.threads} conversas neste lote` });
        await loadFolders(); await loadThreads();
        if (r.done) break;
      }
      toast.success(`Sincronização concluída — últimos 6 meses`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao sincronizar";
      if (msg.includes("project_not_authorized") || msg.includes("GOOGLE_MAIL_API_KEY")) toast.info("Nenhuma conta Gmail conectada");
      else toast.error(msg);
    } finally { setSyncing(false); }
  };

  const fetchThreadMessages = async (threadId: string): Promise<ThreadMessage[]> => {
    const r = await getThreadFn({ data: { threadId } });
    return r.messages as ThreadMessage[];
  };

  const openThread = async (t: ThreadRow) => {
    setSelectedThreadId(t.id); setThreadMessages(null); setLoadingThread(true);
    try {
      setThreadMessages(await fetchThreadMessages(t.id));
      if (t.is_unread) {
        await supabase.from("email_threads").update({ is_unread: false }).eq("id", t.id);
        await supabase.from("emails").update({ is_unread: false }).eq("thread_id", t.id);
        setThreads((prev) => prev.map((x) => x.id === t.id ? { ...x, is_unread: false } : x));
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setLoadingThread(false); }
  };

  const openPopup = async (t: ThreadRow) => {
    setPopupThreadId(t.id); setPopupMessages(null); setPopupLoading(true);
    try { setPopupMessages(await fetchThreadMessages(t.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setPopupLoading(false); }
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
    const t = threads.find((x) => x.id === selectedThreadId); if (!t) return;
    await supabase.from("email_threads").update({ labels: t.labels.filter((l) => l !== "INBOX") }).eq("id", selectedThreadId);
    setSelectedThreadId(null); setThreadMessages(null); await loadThreads();
  };
  const localTrash = async () => {
    if (!selectedThreadId) return;
    const t = threads.find((x) => x.id === selectedThreadId); if (!t) return;
    const labs = Array.from(new Set([...t.labels.filter((l) => l !== "INBOX"), "TRASH"]));
    await supabase.from("email_threads").update({ labels: labs }).eq("id", selectedThreadId);
    await supabase.from("emails").update({ labels: labs }).eq("thread_id", selectedThreadId);
    setSelectedThreadId(null); setThreadMessages(null); await loadThreads();
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
      toast.success("Enviado"); setComposeOpen(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSending(false); }
  };

  const sidebarSystem = useMemo(() => SYSTEM_ORDER.map((id) => folders.find((f) => f.id === id)).filter(Boolean) as Folder[], [folders]);
  const sidebarUser = useMemo(() => folders.filter((f) => f.type === "user").sort((a, b) => a.name.localeCompare(b.name)), [folders]);

  const selected = threads.find((t) => t.id === selectedThreadId) ?? null;
  const popupThread = threads.find((t) => t.id === popupThreadId) ?? null;

  if (mode === "lead" && leadId) return <LeadEmailMini leadId={leadId} className={className} />;

  if (authorizedEmails === null) {
    return <div className={cn("flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground", className)}>Carregando…</div>;
  }
  if (!hasMailbox) {
    return (
      <div className={cn("flex h-[calc(100vh-4rem)] items-center justify-center bg-background", className)}>
        <div className="max-w-md text-center px-6 py-10 rounded-lg border bg-card">
          <Mail className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">Nenhuma conta de email vinculada</h2>
          <p className="text-sm text-muted-foreground">Solicite ao administrador que vincule sua conta.</p>
        </div>
      </div>
    );
  }

  // ---- Sidebar render ----
  const renderFolderBtn = (f: Folder, isUser = false) => {
    const Icon = isUser ? Tag : (SYSTEM_ICONS[f.id] ?? Mail);
    const active = activeLabel === f.id;
    const label = isUser ? f.name : (SYSTEM_NAMES_PT[f.id] ?? f.name);
    const onClick = () => { setActiveLabel(f.id); setSelectedThreadId(null); setThreadMessages(null); };
    if (collapsed) {
      return (
        <Tooltip key={f.id} delayDuration={200}>
          <TooltipTrigger asChild>
            <button onClick={onClick}
              className={cn("w-10 h-10 mx-auto flex items-center justify-center rounded-md relative",
                active ? "bg-primary/15 text-primary" : "hover:bg-muted text-foreground/80")}>
              <Icon className="h-4 w-4" style={isUser && f.color_bg ? { color: f.color_bg } : undefined} />
              {f.unread_count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                  {f.unread_count > 99 ? "99+" : f.unread_count}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}{f.unread_count > 0 ? ` (${f.unread_count})` : ""}</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <button key={f.id} onClick={onClick}
        className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-r-full text-sm transition-colors",
          active ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted text-foreground/80")}>
        <Icon className="h-4 w-4 shrink-0" style={isUser && f.color_bg ? { color: f.color_bg } : undefined} />
        <span className="flex-1 text-left truncate">{label}</span>
        {f.unread_count > 0 && <span className="text-xs font-medium tabular-nums">{f.unread_count}</span>}
      </button>
    );
  };

  const Sidebar = (
    <aside className={cn("shrink-0 border-r flex flex-col bg-background h-full", collapsed ? "w-14" : "w-60")}>
      <div className={cn("p-2 border-b flex items-center gap-2", collapsed && "flex-col")}>
        {!collapsed && (
          <Button onClick={doFullSync} disabled={syncing} className="flex-1 justify-start gap-2" variant="default" size="sm">
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </Button>
        )}
        {collapsed && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button onClick={doFullSync} disabled={syncing} size="icon" variant="default" className="h-9 w-9">
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sincronizar Gmail</TooltipContent>
          </Tooltip>
        )}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Expandir" : "Recolher"}</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="flex-1">
        <nav className={cn("py-2 space-y-0.5", collapsed ? "px-1" : "px-2")}>
          {sidebarSystem.map((f) => renderFolderBtn(f, false))}
          {sidebarUser.length > 0 && (
            <>
              {!collapsed && <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Marcadores</div>}
              {collapsed && <div className="my-2 mx-auto w-6 h-px bg-border" />}
              {sidebarUser.map((f) => renderFolderBtn(f, true))}
            </>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );

  const ThreadList = (
    <section className="flex flex-col h-full bg-background min-w-0">
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar e-mails" className="pl-9" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {threads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma conversa</div>
        ) : threads.map((t) => (
          <button key={t.id}
            onClick={() => void openThread(t)}
            onDoubleClick={() => void openPopup(t)}
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
  );

  const Reader = !selected ? (
    <div className="flex-1 flex items-center justify-center text-muted-foreground h-full bg-background">
      <div className="text-center">
        <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Selecione uma conversa</p>
        <p className="text-xs mt-2">Dica: duplo clique abre em popup</p>
      </div>
    </div>
  ) : (
    <ThreadReader
      thread={{ id: selected.id, subject: selected.subject, is_starred: selected.is_starred }}
      messages={threadMessages}
      loading={loadingThread}
      onArchive={() => void localArchive()}
      onTrash={() => void localTrash()}
      onStar={() => void localStar(selected)}
      onReply={(m) => openCompose(m, "reply")}
      onForward={(m) => openCompose(m, "forward")}
      onDownloadAttachment={(id, a) => void downloadAttachment(id, a)}
    />
  );

  return (
    <TooltipProvider>
      <div className={cn("flex h-[calc(100vh-4rem)] bg-background", className)}>
        {Sidebar}
        <div className="w-96 shrink-0 border-r">{ThreadList}</div>
        <div className="flex-1 min-w-0">{Reader}</div>

        {/* POPUP independente */}
        <Dialog open={!!popupThreadId} onOpenChange={(o) => { if (!o) { setPopupThreadId(null); setPopupMessages(null); } }}>
          <DialogContent className="sm:max-w-5xl h-[85vh] p-0 flex flex-col gap-0">
            <div className="sr-only"><DialogHeader><DialogTitle>Conversa</DialogTitle></DialogHeader></div>
            {popupThread && (
              <ThreadReader
                thread={{ id: popupThread.id, subject: popupThread.subject, is_starred: popupThread.is_starred }}
                messages={popupMessages}
                loading={popupLoading}
                onReply={(m) => openCompose(m, "reply")}
                onForward={(m) => openCompose(m, "forward")}
                onDownloadAttachment={(id, a) => void downloadAttachment(id, a)}
              />
            )}
          </DialogContent>
        </Dialog>

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
    </TooltipProvider>
  );
}

// Stub mínimo para modo lead
function LeadEmailMini({ leadId, className }: { leadId: string; className?: string }) {
  type Row = { id: string; from_name: string | null; from_email: string | null; subject: string | null; snippet: string | null; internal_date: string | null; received_at: string | null };
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void supabase.from("emails").select("id,from_name,from_email,subject,snippet,internal_date,received_at").eq("lead_id", leadId).order("internal_date", { ascending: false }).limit(50).then(({ data }) => setRows((data ?? []) as Row[]));
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
