import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Inbox, Send, FileText, AlertOctagon, Trash2, Star, Tag, RefreshCw, Search, Paperclip, Mail, PanelLeftClose, PanelLeftOpen, Check, Loader2, Circle, X, ChevronDown } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { gmailListLabels, gmailIncrementalSync, gmailGetThread, gmailGetAttachment, gmailListLive } from "@/server/gmail-mirror.functions";
import { gmailSend } from "@/server/gmail.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ThreadMessage } from "@/components/email/ThreadReader";
import { ThreadWindowManager, type ThreadWindowManagerHandle } from "@/components/email/ThreadWindowManager";

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
const LS_SYNC_DAYS = "email.sync.windowDays";
const SYNC_PRESETS: { label: string; days: number }[] = [
  { label: "Últimos 3 meses", days: 90 },
  { label: "Últimos 6 meses", days: 180 },
  { label: "Últimos 12 meses", days: 365 },
  { label: "Últimos 24 meses", days: 730 },
];
const formatWindowLabel = (days: number) => {
  if (days % 30 === 0) {
    const m = days / 30;
    return m === 1 ? "1 mês" : `${m} meses`;
  }
  return `${days} dias`;
};

const SYNC_LABELS = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"] as const;
type SyncLabel = typeof SYNC_LABELS[number];
type LabelStatus = "pending" | "active" | "done";
type SyncProgressState = {
  active: boolean;
  hidden: boolean;
  currentLabel: SyncLabel | null;
  currentMonthLabel: string | null;
  currentMonthIndex: number; // 1-based for display
  totalMonths: number;
  totalSynced: number;
  perLabel: Record<SyncLabel, { count: number; threads: number; status: LabelStatus }>;
};
const initialPerLabel = (): SyncProgressState["perLabel"] =>
  SYNC_LABELS.reduce((acc, l) => { acc[l] = { count: 0, threads: 0, status: "pending" }; return acc; }, {} as SyncProgressState["perLabel"]);
const initialSyncProgress = (): SyncProgressState => ({
  active: false, hidden: false, currentLabel: null, currentMonthLabel: null, currentMonthIndex: 0, totalMonths: 12, totalSynced: 0, perLabel: initialPerLabel(),
});

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
  const listLiveFn = useServerFn(gmailListLive);
  const incSyncFn = useServerFn(gmailIncrementalSync);
  const getThreadFn = useServerFn(gmailGetThread);
  const getAttachmentFn = useServerFn(gmailGetAttachment);
  const sendFn = useServerFn(gmailSend);

  const PAGE_SIZE = 200;
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [lastPageFull, setLastPageFull] = useState<boolean>(false);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("INBOX");

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [search, setSearch] = useState("");

  // Cache em memória por pasta (vive enquanto a página /email estiver aberta).
  type LabelCache = { threads: ThreadRow[]; pageSize: number; nextPageToken: string | null; lastPageFull: boolean };
  const cacheRef = useRef<Map<string, LabelCache>>(new Map());
  // Mantém referência atual para snapshot na troca de pasta.
  const snapshotRef = useRef<LabelCache>({ threads: [], pageSize: PAGE_SIZE, nextPageToken: null, lastPageFull: false });
  useEffect(() => {
    snapshotRef.current = { threads, pageSize, nextPageToken, lastPageFull };
    cacheRef.current.set(activeLabel, snapshotRef.current);
  }, [threads, pageSize, nextPageToken, lastPageFull, activeLabel]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  // (leitor agora vive em janelas; estados removidos)
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressState>(initialSyncProgress);
  const [syncWindowDays, setSyncWindowDays] = useState<number>(() => {
    if (typeof window === "undefined") return 360;
    const v = Number(localStorage.getItem(LS_SYNC_DAYS));
    return Number.isFinite(v) && v >= 1 && v <= 3650 ? v : 360;
  });
  useEffect(() => { try { localStorage.setItem(LS_SYNC_DAYS, String(syncWindowDays)); } catch {} }, [syncWindowDays]);
  const [customDaysOpen, setCustomDaysOpen] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState<string>(String(syncWindowDays));
  const [composeOpen, setComposeOpen] = useState<null | { mode: "reply" | "forward" | "new"; msg?: ThreadMessage }>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // Janelas flutuantes (manager)
  const windowsRef = useRef<ThreadWindowManagerHandle>(null);

  // sidebar collapsed
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_COLLAPSED) === "1";
  });
  useEffect(() => { try { localStorage.setItem(LS_COLLAPSED, collapsed ? "1" : "0"); } catch {} }, [collapsed]);


  const [authorizedEmails, setAuthorizedEmails] = useState<string[] | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  const loadAccounts = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setAuthorizedEmails([]); return; }
    const { data } = await supabase.from("user_email_accounts").select("email_address").eq("user_id", uid);
    setAuthorizedEmails(((data ?? []) as Array<{ email_address: string }>).map((r) => r.email_address.toLowerCase()));
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const addEmailAccount = useCallback(async () => {
    const email = newAccountEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Informe um endereço de email válido.");
      return;
    }
    setAddingAccount(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { toast.error("Sessão expirada."); return; }
      const isFirst = (authorizedEmails?.length ?? 0) === 0;
      const { error } = await supabase
        .from("user_email_accounts")
        .insert({ user_id: uid, email_address: email, is_primary: isFirst });
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          toast.error("Esta conta já está vinculada.");
        } else {
          toast.error(error.message || "Falha ao vincular conta.");
        }
        return;
      }
      toast.success(`Conta ${email} vinculada.`);
      setNewAccountEmail("");
      setAddAccountOpen(false);
      await loadAccounts();
    } finally {
      setAddingAccount(false);
    }
  }, [newAccountEmail, authorizedEmails, loadAccounts]);

  const hasMailbox = (authorizedEmails?.length ?? 0) > 0;

  // Live mirror state (driven by background cron / realtime)
  type MirrorState = {
    in_progress: boolean;
    current_label: string | null;
    month_offset: number;
    total_synced: number;
    label_queue: string[];
    started_at: string | null;
    last_full_sync_at: string | null;
    empty_streak: number;
  };
  const [mirror, setMirror] = useState<MirrorState | null>(null);
  const [mirrorHidden, setMirrorHidden] = useState(false);

  useEffect(() => {
    if (!hasMailbox) { setMirror(null); return; }
    const owners = authorizedEmails!;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("email_sync_state")
        .select("full_sync_in_progress, full_sync_current_label, full_sync_current_month_offset, full_sync_total_synced, full_sync_label_queue, full_sync_started_at, last_full_sync_at, full_sync_empty_streak")
        .in("owner_email", owners)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      setMirror({
        in_progress: !!data.full_sync_in_progress,
        current_label: data.full_sync_current_label,
        month_offset: data.full_sync_current_month_offset ?? 0,
        total_synced: data.full_sync_total_synced ?? 0,
        label_queue: (data.full_sync_label_queue ?? []) as string[],
        started_at: data.full_sync_started_at,
        last_full_sync_at: data.last_full_sync_at,
        empty_streak: data.full_sync_empty_streak ?? 0,
      });
      if (data.full_sync_in_progress) setMirrorHidden(false);
    };
    void load();
    const channel = supabase
      .channel("email_sync_state_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_sync_state" }, () => { void load(); })
      .subscribe();
    const poll = setInterval(load, 20_000);
    return () => { cancelled = true; supabase.removeChannel(channel); clearInterval(poll); };
  }, [hasMailbox, authorizedEmails]);

  const loadFolders = useCallback(async () => {
    if (!hasMailbox) { setFolders([]); return; }
    const { data } = await supabase.from("email_labels").select("*").in("owner_email", authorizedEmails!).order("name");
    setFolders((data ?? []) as Folder[]);
  }, [hasMailbox, authorizedEmails]);

  const mergeUnique = useCallback((incoming: ThreadRow[], existing: ThreadRow[]): ThreadRow[] => {
    const map = new Map<string, ThreadRow>();
    for (const t of existing) map.set(t.id, t);
    for (const t of incoming) map.set(t.id, t); // incoming overrides
    const out = Array.from(map.values());
    out.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
    return out;
  }, []);

  const loadThreads = useCallback(async () => {
    if (!hasMailbox) { setThreads([]); return; }
    const term = search.trim();
    const safe = term.replace(/[%,()"\\]/g, " ").trim();
    const like = safe ? `%${safe}%` : "";
    const isSearching = !!safe;

    const OUTBOUND = new Set(["SENT", "DRAFT", "TRASH", "SPAM"]);
    if (OUTBOUND.has(activeLabel)) {
      const owners = authorizedEmails!;
      let q = supabase
        .from("emails")
        .select("id, thread_id, subject, snippet, from_email, from_name, to_emails, internal_date, is_starred, is_unread, is_important, has_attachments, labels, body_text, owner_email")
        .in("owner_email", owners)
        .contains("labels", [activeLabel])
        .order("internal_date", { ascending: false })
        .limit(Math.max(pageSize, PAGE_SIZE) * 3);
      if (activeLabel === "SENT" || activeLabel === "DRAFT") {
        const ownerOrFilter = owners.map((o) => `from_email.ilike.${o}`).join(",");
        q = q.or(ownerOrFilter);
      }
      if (safe) {
        q = q.or(`subject.ilike.${like},from_name.ilike.${like},from_email.ilike.${like},snippet.ilike.${like},body_text.ilike.${like}`);
      }
      const { data, error } = await q;
      if (error) { toast.error(error.message); return; }
      const seen = new Set<string>();
      const rows: ThreadRow[] = [];
      for (const m of (data ?? []) as Array<{ id: string; thread_id: string | null; subject: string | null; snippet: string | null; from_email: string | null; from_name: string | null; to_emails: string[] | null; internal_date: string | null; is_starred: boolean; is_unread: boolean; is_important: boolean; has_attachments: boolean; labels: string[] | null; owner_email: string | null }>) {
        const tid = m.thread_id ?? m.id;
        if (seen.has(tid)) continue;
        seen.add(tid);
        const participants = (activeLabel === "SENT" || activeLabel === "DRAFT")
          ? (m.to_emails && m.to_emails.length > 0
              ? m.to_emails.map((t) => `Para: ${t}`)
              : ["Para: (sem destinatário)"])
          : [m.from_name || m.from_email || "(sem remetente)"];
        rows.push({
          id: tid,
          subject: m.subject,
          snippet: m.snippet,
          participants,
          last_message_at: m.internal_date,
          message_count: 1,
          is_unread: m.is_unread,
          is_starred: m.is_starred,
          is_important: m.is_important,
          has_attachments: m.has_attachments,
          labels: m.labels ?? [],
        });
        if (rows.length >= pageSize) break;
      }
      setLastPageFull(rows.length >= pageSize);
      if (isSearching) setThreads(rows);
      else setThreads((prev) => mergeUnique(rows, prev));
      return;
    }

    let threadIdHits: string[] | null = null;
    if (safe) {
      const { data: hits } = await supabase
        .from("emails")
        .select("thread_id")
        .in("owner_email", authorizedEmails!)
        .or(`subject.ilike.${like},from_name.ilike.${like},from_email.ilike.${like},snippet.ilike.${like},body_text.ilike.${like}`)
        .limit(500);
      threadIdHits = Array.from(new Set(((hits ?? []) as Array<{ thread_id: string | null }>).map((h) => h.thread_id).filter((x): x is string => !!x)));
    }
    let q = supabase.from("email_threads").select("*").in("owner_email", authorizedEmails!)
      .order("last_message_at", { ascending: false }).limit(pageSize);
    q = q.contains("labels", [activeLabel]);
    if (safe) {
      const orParts = [`subject.ilike.${like}`, `snippet.ilike.${like}`];
      orParts.push(`participants.cs.{${safe}}`);
      if (threadIdHits && threadIdHits.length) {
        orParts.push(`id.in.(${threadIdHits.map((id) => `"${id}"`).join(",")})`);
      }
      q = q.or(orParts.join(","));
    }
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as ThreadRow[];
    setLastPageFull(rows.length >= pageSize);
    if (isSearching) setThreads(rows);
    else setThreads((prev) => mergeUnique(rows, prev));
  }, [activeLabel, search, hasMailbox, authorizedEmails, pageSize, mergeUnique]);


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

  // Realtime: aplica mudanças incrementalmente sem reescrever a lista inteira.
  useEffect(() => {
    const ch = supabase.channel("email-mirror")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, (payload) => {
        const newRow = payload.new as ThreadRow | null;
        const oldRow = payload.old as { id?: string } | null;
        if (payload.eventType === "DELETE") {
          if (!oldRow?.id) return;
          setThreads((prev) => prev.filter((x) => x.id !== oldRow.id));
          return;
        }
        if (!newRow) return;
        const labels = newRow.labels ?? [];
        const belongsHere = labels.includes(activeLabel);
        setThreads((prev) => {
          const idx = prev.findIndex((x) => x.id === newRow.id);
          if (!belongsHere) {
            // removeu da label atual
            return idx >= 0 ? prev.filter((x) => x.id !== newRow.id) : prev;
          }
          if (idx >= 0) {
            const copy = prev.slice();
            copy[idx] = { ...prev[idx], ...newRow };
            return copy;
          }
          return mergeUnique([newRow], prev);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "email_labels" }, () => loadFolders())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [loadFolders, activeLabel, mergeUnique]);

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

  // Atualiza a caixa atual buscando direto no Gmail (1 página de 200) ou
  // — se o Gmail falhar — busca direto no banco a partir do que já temos.
  const refreshLive = async (opts?: { append?: boolean }) => {
    const append = !!opts?.append;
    if (append) setLoadingMore(true); else setRefreshing(true);
    let liveOk = false;
    try {
      await listLabelsFn({ data: undefined as never });
      const r = await listLiveFn({
        data: {
          labelId: activeLabel,
          pageToken: append ? (nextPageToken ?? undefined) : undefined,
          maxResults: PAGE_SIZE,
          q: search.trim() || undefined,
        },
      });
      setNextPageToken(r.nextPageToken);
      liveOk = true;
      if (!append) toast.success(`Atualizado — ${r.count} mensagens carregadas`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao atualizar";
      if (msg.includes("project_not_authorized") || msg.includes("GOOGLE_MAIL_API_KEY")) {
        if (!append) toast.info("Nenhuma conta Gmail conectada");
      } else if (!append) {
        toast.error(msg);
      }
    }
    try {
      if (append) {
        // Sempre cresce a janela em +200, mesmo se o live falhou —
        // assim o botão sempre revela mais 200 do banco local.
        setPageSize((s) => s + PAGE_SIZE);
      }
      await loadFolders();
      await loadThreads();
    } finally {
      if (append) setLoadingMore(false); else setRefreshing(false);
    }
    void liveOk;
  };

  // Troca de pasta: salva snapshot da pasta atual e restaura cache da nova.
  const switchLabel = useCallback((next: string) => {
    if (next === activeLabel) return;
    cacheRef.current.set(activeLabel, snapshotRef.current);
    setActiveLabel(next);
    setSelectedThreadId(null);
    const cached = cacheRef.current.get(next);
    if (cached) {
      setThreads(cached.threads);
      setPageSize(cached.pageSize);
      setNextPageToken(cached.nextPageToken);
      setLastPageFull(cached.lastPageFull);
    } else {
      setThreads([]);
      setPageSize(PAGE_SIZE);
      setNextPageToken(null);
      setLastPageFull(false);
    }
  }, [activeLabel]);

  // Em background, busca a 1ª página live da pasta ativa e mescla.
  useEffect(() => {
    if (!hasMailbox || mode !== "full") return;
    void (async () => {
      try {
        const r = await listLiveFn({
          data: { labelId: activeLabel, maxResults: PAGE_SIZE, q: search.trim() || undefined },
        });
        setNextPageToken((tok) => tok ?? r.nextPageToken);
        await loadFolders();
        await loadThreads();
      } catch { /* silent — cache continua exibido */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLabel, hasMailbox, mode]);


  const fetchThreadMessages = async (threadId: string): Promise<ThreadMessage[]> => {
    const r = await getThreadFn({ data: { threadId } });
    return r.messages as ThreadMessage[];
  };

  const openThread = (t: ThreadRow) => {
    setSelectedThreadId(t.id);
    windowsRef.current?.openOrFocus({ id: t.id, subject: t.subject, is_starred: t.is_starred });
  };

  const markThreadRead = async (threadId: string) => {
    const t = threads.find((x) => x.id === threadId);
    if (!t || !t.is_unread) return;
    await supabase.from("email_threads").update({ is_unread: false }).eq("id", threadId);
    await supabase.from("emails").update({ is_unread: false }).eq("thread_id", threadId);
    setThreads((prev) => prev.map((x) => x.id === threadId ? { ...x, is_unread: false } : x));
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
  const archiveThread = async (threadId: string) => {
    const t = threads.find((x) => x.id === threadId); if (!t) return;
    await supabase.from("email_threads").update({ labels: t.labels.filter((l) => l !== "INBOX") }).eq("id", threadId);
    if (selectedThreadId === threadId) setSelectedThreadId(null);
    await loadThreads();
  };
  const trashThread = async (threadId: string) => {
    const t = threads.find((x) => x.id === threadId); if (!t) return;
    const labs = Array.from(new Set([...t.labels.filter((l) => l !== "INBOX"), "TRASH"]));
    await supabase.from("email_threads").update({ labels: labs }).eq("id", threadId);
    await supabase.from("emails").update({ labels: labs }).eq("thread_id", threadId);
    if (selectedThreadId === threadId) setSelectedThreadId(null);
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
      toast.success("Enviado"); setComposeOpen(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSending(false); }
  };

  const sidebarSystem = useMemo(() => SYSTEM_ORDER.map((id) => folders.find((f) => f.id === id)).filter(Boolean) as Folder[], [folders]);
  const sidebarUser = useMemo(() => folders.filter((f) => f.type === "user").sort((a, b) => a.name.localeCompare(b.name)), [folders]);

  const selected = threads.find((t) => t.id === selectedThreadId) ?? null;
  void selected;

  if (mode === "lead" && leadId) return <LeadEmailMini leadId={leadId} className={className} />;

  if (authorizedEmails === null) {
    return <div className={cn("flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground", className)}>Carregando…</div>;
  }
  const AddAccountDialog = (
    <Dialog open={addAccountOpen} onOpenChange={(o) => { setAddAccountOpen(o); if (!o) setNewAccountEmail(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular conta de email</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-email-account">Endereço Gmail</Label>
          <Input
            id="new-email-account"
            type="email"
            autoFocus
            placeholder="voce@gmail.com"
            value={newAccountEmail}
            onChange={(e) => setNewAccountEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addEmailAccount(); }}
          />
          <p className="text-xs text-muted-foreground">
            A conta será vinculada ao seu usuário. A sincronização usa a integração Gmail já configurada.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAddAccountOpen(false)} disabled={addingAccount}>Cancelar</Button>
          <Button onClick={() => void addEmailAccount()} disabled={addingAccount}>
            {addingAccount && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!hasMailbox) {
    return (
      <div className={cn("flex h-[calc(100vh-4rem)] items-center justify-center bg-background", className)}>
        <div className="max-w-md text-center px-6 py-10 rounded-lg border bg-card">
          <Mail className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">Nenhuma conta de email vinculada</h2>
          <p className="text-sm text-muted-foreground mb-4">Vincule uma conta Gmail para começar a sincronizar.</p>
          <Button onClick={() => setAddAccountOpen(true)}>
            <Mail className="h-4 w-4 mr-2" /> Adicionar conta de email
          </Button>
        </div>
        {AddAccountDialog}
      </div>
    );
  }

  // ---- Sidebar render ----
  const renderFolderBtn = (f: Folder, isUser = false) => {
    const Icon = isUser ? Tag : (SYSTEM_ICONS[f.id] ?? Mail);
    const active = activeLabel === f.id;
    const label = isUser ? f.name : (SYSTEM_NAMES_PT[f.id] ?? f.name);
    const onClick = () => { switchLabel(f.id); };
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
          <div className="flex-1 flex">
            <Button onClick={() => void refreshLive()} disabled={refreshing} className="flex-1 justify-start gap-2 rounded-r-none" variant="default" size="sm">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              <span className="truncate">{refreshing ? "Atualizando…" : "Atualizar caixa"}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={refreshing} variant="default" size="sm" className="px-2 rounded-l-none border-l border-primary-foreground/20">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setAddAccountOpen(true)}>
                  <Mail className="h-3.5 w-3.5 mr-2" />
                  <span className="flex-1">Adicionar conta de email…</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {collapsed && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button disabled={refreshing} size="icon" variant="default" className="h-9 w-9" onClick={() => void refreshLive()}>
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Atualizar caixa</TooltipContent>
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

  const labelNamesPt: Record<SyncLabel, string> = {
    INBOX: "Caixa de entrada", SENT: "Enviados", DRAFT: "Rascunhos",
    SPAM: "Spam", TRASH: "Lixeira", IMPORTANT: "Importantes", STARRED: "Com estrela",
  };
  const doneCount = SYNC_LABELS.filter((l) => syncProgress.perLabel[l].status === "done").length;
  const showSyncPanel = syncProgress.active && !syncProgress.hidden;

  const SyncProgressPanel = showSyncPanel ? (
    <div className="border-b bg-card/50 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">Sincronizando {formatWindowLabel(syncWindowDays)}</div>
          <div className="text-xs text-muted-foreground">
            {syncProgress.totalSynced.toLocaleString("pt-BR")} mensagens · {doneCount} de {SYNC_LABELS.length} pastas
            {syncProgress.currentMonthLabel && syncProgress.currentLabel ? (
              <> · {labelNamesPt[syncProgress.currentLabel]} — {syncProgress.currentMonthLabel} ({syncProgress.currentMonthIndex}/{syncProgress.totalMonths})</>
            ) : null}
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setSyncProgress((p) => ({ ...p, hidden: true }))}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Progress value={(doneCount / SYNC_LABELS.length) * 100} className="h-1.5" />
      <ul className="space-y-1.5">
        {SYNC_LABELS.map((l) => {
          const s = syncProgress.perLabel[l];
          const Icon = s.status === "done" ? Check : s.status === "active" ? Loader2 : Circle;
          return (
            <li key={l} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Icon className={cn("h-3.5 w-3.5 shrink-0",
                  s.status === "done" && "text-primary",
                  s.status === "active" && "text-primary animate-spin",
                  s.status === "pending" && "text-muted-foreground/50")} />
                <span className={cn("flex-1 truncate", s.status === "pending" ? "text-muted-foreground" : "text-foreground")}>{labelNamesPt[l]}</span>
                <span className="tabular-nums text-muted-foreground">{s.count.toLocaleString("pt-BR")}</span>
              </div>
              {s.status === "active" && (
                <div className="h-1 ml-5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-1/3 bg-primary/70 animate-pulse rounded-full" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  // Helpers for live mirror panel
  const resolveLabelName = (id: string | null): string => {
    if (!id) return "—";
    if (SYSTEM_NAMES_PT[id]) return SYSTEM_NAMES_PT[id];
    const f = folders.find((x) => x.id === id);
    return f?.name ?? id;
  };
  const monthLabelFromOffset = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - offset * 30);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };
  const showMirrorPanel = !!mirror && !mirrorHidden && (mirror.in_progress || (mirror.total_synced > 0 && !!mirror.last_full_sync_at));

  const MirrorPanel = null;

  const ThreadList = (
    <ThreadListSection
      threads={threads}
      selectedThreadId={selectedThreadId}
      search={search}
      setSearch={setSearch}
      onOpenThread={openThread}
      onLocalStar={(t) => void localStar(t)}
      loadingMore={loadingMore}
      canLoadMore={threads.length > 0 && (!!nextPageToken || lastPageFull)}
      atEnd={threads.length > 0 && !nextPageToken && !lastPageFull}
      onLoadMore={() => void refreshLive({ append: true })}
      MirrorPanel={MirrorPanel}
      SyncProgressPanel={SyncProgressPanel}
    />
  );

  return (
    <TooltipProvider>
      <div className={cn("flex h-[calc(100vh-4rem)] bg-background", className)}>
        {Sidebar}
        <div className="flex-1 min-w-0">{ThreadList}</div>

        {AddAccountDialog}

        {/* Janelas flutuantes das conversas */}
        <ThreadWindowManager
          ref={windowsRef}
          fetchMessages={fetchThreadMessages}
          onMarkRead={(tid) => void markThreadRead(tid)}
          onStar={(t) => {
            const row = threads.find((x) => x.id === t.id);
            if (row) void localStar(row);
          }}
          onArchive={(tid) => void archiveThread(tid)}
          onTrash={(tid) => void trashThread(tid)}
          onReply={(m) => openCompose(m, "reply")}
          onForward={(m) => openCompose(m, "forward")}
          onDownloadAttachment={(id, a) => void downloadAttachment(id, a)}
        />

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

function ThreadListSection({
  threads, selectedThreadId, search, setSearch, onOpenThread, onLocalStar,
  loadingMore, canLoadMore, atEnd, onLoadMore, MirrorPanel, SyncProgressPanel,
}: {
  threads: ThreadRow[];
  selectedThreadId: string | null;
  search: string;
  setSearch: (s: string) => void;
  onOpenThread: (t: ThreadRow) => void;
  onLocalStar: (t: ThreadRow) => void;
  loadingMore: boolean;
  canLoadMore: boolean;
  atEnd: boolean;
  onLoadMore: () => void;
  MirrorPanel: React.ReactNode;
  SyncProgressPanel: React.ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    overscan: 8,
    getItemKey: (index) => threads[index]?.id ?? index,
  });
  const items = rowVirtualizer.getVirtualItems();
  return (
    <section className="flex flex-col h-full bg-background min-w-0">
      {MirrorPanel}
      {SyncProgressPanel}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar e-mails" className="pl-9" />
        </div>
      </div>
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        {threads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma conversa</div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {items.map((vi) => {
              const t = threads[vi.index];
              if (!t) return null;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                >
                  <button
                    onClick={() => onOpenThread(t)}
                    className={cn("w-full text-left px-3 py-2.5 border-b transition-colors flex gap-2",
                      selectedThreadId === t.id ? "bg-primary/10" : "hover:bg-muted/50",
                      t.is_unread && "bg-card font-medium")}
                  >
                    <button onClick={(e) => { e.stopPropagation(); onLocalStar(t); }} className="shrink-0 mt-0.5">
                      <Star className={cn("h-4 w-4", t.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <div className={cn("text-sm truncate flex-1", t.is_unread && "font-semibold")}>
                          {t.participants.slice(0, 2).join(", ")}{t.message_count > 1 && <span className="text-muted-foreground"> ({t.message_count})</span>}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{formatRelative(t.last_message_at)}</div>
                      </div>
                      <div className="text-sm truncate">{t.subject || "(sem assunto)"}</div>
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        {t.has_attachments && <Paperclip className="h-3 w-3" />}
                        <span className="truncate">{t.snippet}</span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {canLoadMore && (
          <div className="p-3">
            <Button variant="outline" size="sm" className="w-full" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null}
              Carregar mais antigos
            </Button>
          </div>
        )}
        {atEnd && (
          <div className="p-3 text-center text-xs text-muted-foreground">Fim da pasta</div>
        )}
      </div>
    </section>
  );
}

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
