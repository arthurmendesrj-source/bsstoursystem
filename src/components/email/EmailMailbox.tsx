import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, Send, Plus, Reply, Inbox as InboxIcon, MailCheck, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMessagesFn, fetchMessageFn, sendEmailFn, syncFolderFn } from "@/lib/email.functions";
import { analyzeEmailFn, triageInboxFn, type EmailAiResult } from "@/lib/email-ai.functions";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSubordinates, type Subordinate } from "@/lib/hierarchy";
import { notifyTaskAssigned } from "@/lib/tasks.functions";


type Folder = "inbox" | "sent";

export function EmailMailbox({
  targetUserId,
  targetEmail,
  managerMode,
  managerName,
}: {
  targetUserId: string;
  targetEmail: string | null;
  managerMode?: boolean;
  managerName?: string;
}) {
  const list = useServerFn(listMessagesFn);
  const syncFn = useServerFn(syncFolderFn);
  const fetchOne = useServerFn(fetchMessageFn);
  const send = useServerFn(sendEmailFn);
  const analyze = useServerFn(analyzeEmailFn);
  const triage = useServerFn(triageInboxFn);



  const [aiResults, setAiResults] = useState<Record<string, EmailAiResult>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [triageRunning, setTriageRunning] = useState(false);
  const [triageProgress, setTriageProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const triageCancelRef = useRef(false);

  const [folder, setFolder] = useState<Folder>("inbox");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [composing, setComposing] = useState<null | { to: string; subject: string; body: string; inReplyTo?: string }>(null);
  const [sending, setSending] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const LIST_MIN = 240, LIST_MAX = 560, LIST_DEFAULT = 380, LIST_COLLAPSED = 44;
  const [listCollapsed, setListCollapsed] = useState(false);
  const [listWidth, setListWidth] = useState<number>(() => {
    if (typeof window === "undefined") return LIST_DEFAULT;
    const v = Number(localStorage.getItem("email:list:width"));
    return Number.isFinite(v) && v >= LIST_MIN && v <= LIST_MAX ? v : LIST_DEFAULT;
  });
  useEffect(() => { try { localStorage.removeItem("email:list:collapsed"); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("email:list:width", String(listWidth)); } catch {} }, [listWidth]);
  const listDragging = useRef(false);
  const onListResizeDown = useCallback((e: React.MouseEvent) => {
    if (listCollapsed) return;
    e.preventDefault();
    listDragging.current = true;
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: MouseEvent) => {
      if (!listDragging.current) return;
      const next = Math.min(LIST_MAX, Math.max(LIST_MIN, startW + (ev.clientX - startX)));
      setListWidth(next);
    };
    const onUp = () => {
      listDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [listCollapsed, listWidth]);

  const refreshIdRef = useRef(0);
  // Just reads the cache (instant). Used on mount and when switching folders/searching.
  const refresh = async () => {
    const myId = ++refreshIdRef.current;
    setLoading(true);
    setFetchError(null);
    try {
      const r: any = await list({ data: { targetUserId, folder, search } });
      if (refreshIdRef.current !== myId) return;
      setMessages(r.messages ?? []);
      setNotConnected(r.connected === false);
      setFetchError(r.error ?? null);
      if (r.error) toast.error(r.error);
    } catch (e: any) {
      if (refreshIdRef.current !== myId) return;
      const msg = e?.message ?? "Falha ao listar mensagens";
      setFetchError(msg);
      toast.error(msg);
    } finally {
      if (refreshIdRef.current === myId) setLoading(false);
    }
  };

  // Forces a sync with Gmail then re-reads the cache.
  const syncNow = async () => {
    const myId = ++refreshIdRef.current;
    setLoading(true);
    setFetchError(null);
    const safety = setTimeout(() => {
      if (refreshIdRef.current === myId) {
        setLoading(false);
        setFetchError("Tempo esgotado ao sincronizar. Tente novamente.");
        toast.error("Tempo esgotado ao sincronizar.");
      }
    }, 60_000);
    try {
      const r: any = await syncFn({ data: { targetUserId, folder, search } });
      if (refreshIdRef.current !== myId) return;
      setMessages(r.messages ?? []);
      setNotConnected(r.connected === false);
      setFetchError(r.error ?? null);
      if (r.error) toast.error(r.error);
      else toast.success("Caixa atualizada.");
    } catch (e: any) {
      if (refreshIdRef.current !== myId) return;
      const msg = e?.message ?? "Falha ao sincronizar";
      setFetchError(msg);
      toast.error(msg);
    } finally {
      clearTimeout(safety);
      if (refreshIdRef.current === myId) setLoading(false);
    }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder, targetUserId]);

  // Background auto-refresh on the email screen: silently re-syncs the *current*
  // folder/search every 30s so the list updates while the user is looking at it.
  // (A global hook in __root also keeps the inbox cache fresh for any route.)
  const bgSyncingRef = useRef(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (bgSyncingRef.current || loading || notConnected) return;
      bgSyncingRef.current = true;
      try {
        const r: any = await syncFn({ data: { targetUserId, folder, search } });
        if (cancelled) return;
        if (r?.messages) setMessages(r.messages);
        if (r?.connected === false) setNotConnected(true);
        if (!r?.error) setLastSyncAt(Date.now());
      } catch {
        // silent
      } finally {
        bgSyncingRef.current = false;
      }
    };
    const id = window.setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, targetUserId, search, notConnected]);


  // Update the "Atualizado há Xs" label every 15s.
  const [, setTickNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTickNow((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return null;
    const s = Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000));
    if (s < 60) return `Atualizado há ${s}s`;
    const m = Math.round(s / 60);
    return `Atualizado há ${m} min`;
  }, [lastSyncAt]);

  useEffect(() => {
    if (selectedUid == null) { setSelected(null); return; }
    const m = messages.find((x: any) => x.uid === selectedUid);
    const gmailId = m?.gmailId;
    if (!gmailId) { setSelected(null); return; }
    let cancel = false;
    (async () => {
      try {
        const r = await fetchOne({ data: { targetUserId, folder, uid: selectedUid, gmailId } });
        if (!cancel) setSelected(r);
      } catch (e: any) {
        if (!cancel) toast.error(e?.message ?? "Falha ao abrir mensagem");
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUid, folder, targetUserId, messages]);

  const handleSend = async () => {
    if (!composing) return;
    if (!composing.to.trim() || !composing.subject.trim()) {
      toast.error("Preencha destinatário e assunto");
      return;
    }
    setSending(true);
    try {
      await send({ data: {
        targetUserId,
        to: composing.to,
        subject: composing.subject,
        body: composing.body,
        inReplyTo: composing.inReplyTo,
      }});
      toast.success(managerMode ? "Enviado em nome do usuário. Ação registrada." : "Enviado.");
      setComposing(null);
      if (folder === "sent") await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSending(false);
    }
  };

  const runAnalyze = async (force = false) => {
    if (!selected?.gmailId) return;
    setAiLoading(true);
    try {
      const r: any = await analyze({ data: { targetUserId, gmailId: selected.gmailId, force } });
      setAiResults((m) => ({ ...m, [selected.gmailId]: r.result }));
      if (!r.cached) toast.success("Análise concluída.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na análise");
    } finally {
      setAiLoading(false);
    }
  };

  const runTriage = async () => {
    const ids = messages.slice(0, 20).map((m: any) => m.gmailId).filter(Boolean);
    if (ids.length === 0) { toast.info("Sem mensagens para triagem."); return; }
    triageCancelRef.current = false;
    setTriageRunning(true);
    setTriageProgress({ done: 0, total: ids.length });
    try {
      // Processa em chunks pequenos para mostrar progresso
      const chunkSize = 3;
      for (let i = 0; i < ids.length; i += chunkSize) {
        if (triageCancelRef.current) break;
        const chunk = ids.slice(i, i + chunkSize);
        const r: any = await triage({ data: { targetUserId, gmailIds: chunk } });
        const next: Record<string, EmailAiResult> = {};
        for (const row of r.results ?? []) {
          if (row.result) next[row.gmailId] = row.result;
        }
        setAiResults((m) => ({ ...m, ...next }));
        setTriageProgress({ done: Math.min(i + chunkSize, ids.length), total: ids.length });
      }
      toast.success("Triagem concluída.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na triagem");
    } finally {
      setTriageRunning(false);
    }
  };




  return (
    <div className="space-y-3">
      {managerMode && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Espelho de <strong>{managerName ?? "usuário"}</strong>. Envios usam a caixa dele e ficam registrados na auditoria.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" /> {targetEmail ?? "—"}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por assunto/remetente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") refresh(); }}
            className="w-64"
          />
          <Button variant="outline" size="sm" onClick={syncNow} disabled={loading} title="Sincronizar com o Gmail">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {lastSyncLabel && (
            <span className="text-xs text-muted-foreground hidden md:inline" title="Atualiza automaticamente a cada 30s">
              {lastSyncLabel}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={runTriage}
            disabled={triageRunning || messages.length === 0}
            title="Analisa os 20 primeiros emails com IA"
          >
            {triageRunning ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Triando {triageProgress.done}/{triageProgress.total}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" />Triagem IA</>
            )}
          </Button>
          {triageRunning && (
            <Button variant="ghost" size="sm" onClick={() => { triageCancelRef.current = true; }}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={() => setComposing({ to: "", subject: "", body: "" })}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-3">
        <MailboxSidebar
          folder={folder}
          onChange={(f) => { setFolder(f); setSelectedUid(null); }}
        />

        <div className="relative hidden md:block" style={{ width: listCollapsed ? LIST_COLLAPSED : listWidth }}>
          <Card className="h-full">
            <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
              <div className={cn("flex items-center border-b sticky top-0 bg-background z-10", listCollapsed ? "justify-center px-1 py-2" : "justify-between px-3 py-2")}>
                {!listCollapsed && (
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {folder === "inbox" ? "Recebidos" : "Enviados"}
                    {messages.length > 0 && <span className="ml-1 text-muted-foreground/70 normal-case">({messages.length})</span>}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setListCollapsed((c) => !c)}
                  className="h-6 w-6 grid place-items-center rounded-md border border-border bg-background hover:bg-muted"
                  aria-label={listCollapsed ? "Expandir lista" : "Recolher lista"}
                  title={listCollapsed ? "Expandir lista" : "Recolher lista"}
                >
                  {listCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
              </div>
              {!listCollapsed && (
                <>
                  {loading && messages.length === 0 && (
                    <div className="p-6 text-center text-muted-foreground text-sm">Carregando…</div>
                  )}
                  {!loading && messages.length === 0 && notConnected && (
                    <div className="p-6 text-center text-sm text-amber-700">
                      Sua conta não está conectada. Volte e informe a senha de app novamente.
                    </div>
                  )}
                  {!loading && messages.length === 0 && !notConnected && fetchError && (
                    <div className="p-6 text-center text-sm text-destructive whitespace-pre-wrap">
                      {fetchError}
                    </div>
                  )}
                  {!loading && messages.length === 0 && !notConnected && !fetchError && (
                    <div className="p-6 text-center text-muted-foreground text-sm">Sem mensagens</div>
                  )}
                  <ul className="divide-y">
                    {messages.map((m) => {
                      const active = m.uid === selectedUid;
                      const who = folder === "inbox" ? m.from : m.to;
                      return (
                        <li key={m.uid}>
                          <button
                            onClick={() => setSelectedUid(m.uid)}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm truncate ${folder === "inbox" && m.unread ? "font-semibold" : ""}`}>
                                {who || "—"}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {m.date ? new Date(m.date).toLocaleDateString() : ""}
                              </span>
                            </div>
                            <div className={`text-sm truncate ${folder === "inbox" && m.unread ? "font-medium" : "text-muted-foreground"}`}>
                              {m.subject || "(sem assunto)"}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {folder === "inbox" && m.unread && (
                                <Badge variant="secondary" className="text-[10px]">Não lido</Badge>
                              )}
                              {aiResults[m.gmailId] && (
                                <>
                                  <Badge className={cn("text-[10px]", priorityClass(aiResults[m.gmailId].priority))}>
                                    {aiResults[m.gmailId].priority}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {categoryLabel(aiResults[m.gmailId].category)}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {listCollapsed && messages.length > 0 && (
                <div className="flex flex-col items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                  <MailCheck className="h-4 w-4" />
                  <span className="font-medium [writing-mode:vertical-rl] rotate-180">
                    {messages.length} emails
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
          {!listCollapsed && (
            <div
              onMouseDown={onListResizeDown}
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
              aria-label="Redimensionar lista"
              title="Arraste para redimensionar"
            />
          )}
        </div>

        {/* Mobile-only list (mantém comportamento simples) */}
        <Card className="md:hidden">
          <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
            <ul className="divide-y">
              {messages.map((m) => {
                const active = m.uid === selectedUid;
                const who = folder === "inbox" ? m.from : m.to;
                return (
                  <li key={m.uid}>
                    <button
                      onClick={() => setSelectedUid(m.uid)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
                    >
                      <div className="text-sm truncate">{who || "—"}</div>
                      <div className="text-sm text-muted-foreground truncate">{m.subject || "(sem assunto)"}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-4 max-h-[70vh] overflow-y-auto">
            {!selected && (
              <div className="text-sm text-muted-foreground text-center py-12">
                Selecione uma mensagem
              </div>
            )}
            {selected && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold">{selected.subject || "(sem assunto)"}</h3>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div><strong>De:</strong> {selected.from}</div>
                    <div><strong>Para:</strong> {selected.to}</div>
                    {selected.cc && <div><strong>Cc:</strong> {selected.cc}</div>}
                    {selected.date && <div>{new Date(selected.date).toLocaleString()}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setComposing({
                    to: folder === "inbox" ? extractEmail(selected.from) : extractEmail(selected.to),
                    subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject ?? ""}`,
                    body: `\n\n---\nEm ${selected.date ? new Date(selected.date).toLocaleString() : ""}, ${selected.from} escreveu:\n${quote(selected.text)}`,
                    inReplyTo: selected.messageId ?? undefined,
                  })}>
                    <Reply className="h-4 w-4 mr-1" />Responder
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAnalyze(false)} disabled={aiLoading}>
                    {aiLoading
                      ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analisando…</>
                      : <><Sparkles className="h-4 w-4 mr-1" />{aiResults[selected.gmailId] ? "Re-analisar" : "Analisar com IA"}</>}
                  </Button>
                </div>

                {aiResults[selected.gmailId] && (
                  <AiResultPanel
                    result={aiResults[selected.gmailId]}
                    summary={aiResults[selected.gmailId].summary}
                    email={selected}
                  />
                )}

                <div className="border-t pt-3">
                  {selected.html ? (
                    <iframe
                      title="email"
                      sandbox=""
                      srcDoc={selected.html}
                      className="w-full min-h-[400px] border-0"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm font-sans">{selected.text || "(sem conteúdo)"}</pre>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={composing != null} onOpenChange={(o) => !o && setComposing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{composing?.inReplyTo ? "Responder" : "Novo email"}</DialogTitle>
          </DialogHeader>
          {composing && (
            <div className="space-y-3">
              <div>
                <Label>Para</Label>
                <Input value={composing.to} onChange={(e) => setComposing({ ...composing, to: e.target.value })} placeholder="destino@exemplo.com" />
              </div>
              <div>
                <Label>Assunto</Label>
                <Input value={composing.subject} onChange={(e) => setComposing({ ...composing, subject: e.target.value })} />
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea rows={10} value={composing.body} onChange={(e) => setComposing({ ...composing, body: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setComposing(null)}>Cancelar</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractEmail(s: string): string {
  const m = /<([^>]+)>/.exec(s ?? "");
  return m ? m[1] : (s ?? "").trim();
}

function quote(text: string | null | undefined): string {
  if (!text) return "";
  return text.split("\n").map((l) => `> ${l}`).join("\n");
}

function MailboxSidebar({
  folder,
  onChange,
}: {
  folder: Folder;
  onChange: (f: Folder) => void;
}) {
  const COLLAPSED_W = 56;
  const MIN_W = 160;
  const MAX_W = 360;
  const DEFAULT_W = 200;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("email:sidebar:collapsed") === "1";
  });
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_W;
    const v = Number(localStorage.getItem("email:sidebar:width"));
    return Number.isFinite(v) && v >= MIN_W && v <= MAX_W ? v : DEFAULT_W;
  });

  useEffect(() => {
    try { localStorage.setItem("email:sidebar:collapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);
  useEffect(() => {
    try { localStorage.setItem("email:sidebar:width", String(width)); } catch {}
  }, [width]);

  const dragging = useRef(false);
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [collapsed, width]);

  const items: { key: Folder; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "inbox", label: "Recebidos", icon: InboxIcon },
    { key: "sent", label: "Enviados", icon: MailCheck },
  ];

  const itemClass = (active: boolean) => cn(
    "flex items-center gap-2 rounded-md text-sm transition-colors w-full",
    collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );

  return (
    <div className="relative hidden md:block" style={{ width: collapsed ? COLLAPSED_W : width }}>
      <Card className="h-full">
        <CardContent className="p-2 max-h-[70vh] overflow-y-auto">
          <div className={cn("flex items-center mb-2", collapsed ? "justify-center" : "justify-between px-1")}>
            {!collapsed && <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Caixas</span>}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="h-6 w-6 grid place-items-center rounded-md border border-border bg-background hover:bg-muted"
              aria-label={collapsed ? "Expandir" : "Recolher"}
              title={collapsed ? "Expandir" : "Recolher"}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          </div>
          <ul className="space-y-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = folder === it.key;
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => onChange(it.key)}
                    className={itemClass(active)}
                    title={collapsed ? it.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
          aria-label="Redimensionar"
          title="Arraste para redimensionar"
        />
      )}
    </div>
  );
}

function priorityClass(p: "alta" | "normal" | "baixa"): string {
  if (p === "alta") return "bg-red-600 text-white hover:bg-red-600";
  if (p === "baixa") return "bg-slate-300 text-slate-900 hover:bg-slate-300";
  return "bg-amber-500 text-white hover:bg-amber-500";
}

function categoryLabel(c: EmailAiResult["category"]): string {
  switch (c) {
    case "lead_novo": return "Lead novo";
    case "cliente_existente": return "Cliente";
    case "fornecedor": return "Fornecedor";
    case "suporte": return "Suporte";
    case "spam": return "Spam";
    default: return "Outros";
  }
}

function AiResultPanel({
  result,
  email,
}: {
  result: EmailAiResult;
  summary?: string;
  email?: any;
}) {
  const f = result.suggestion.fields;
  const hasFields = Object.values(f).some(Boolean);
  const [mode, setMode] = useState<"none" | "lead" | "activity">(
    result.suggestion.kind === "lead" || result.suggestion.kind === "activity" ? result.suggestion.kind : "none",
  );
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
        <Sparkles className="h-4 w-4" /> Análise da IA
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge className={cn("text-[10px]", priorityClass(result.priority))}>Prioridade: {result.priority}</Badge>
        <Badge variant="outline" className="text-[10px]">{categoryLabel(result.category)}</Badge>
        <Badge variant="outline" className="text-[10px]">Sentimento: {result.sentiment}</Badge>
        <Badge variant="outline" className="text-[10px]">Idioma: {result.language}</Badge>
      </div>
      <p className="text-sm whitespace-pre-wrap">{result.summary || "(sem resumo)"}</p>

      {hasFields && (
        <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 rounded border bg-white/60 p-2">
          {f.contact_name && <li><strong>Nome:</strong> {f.contact_name}</li>}
          {f.contact_email && <li><strong>Email:</strong> {f.contact_email}</li>}
          {f.contact_phone && <li><strong>Telefone:</strong> {f.contact_phone}</li>}
          {f.destination && <li><strong>Destino:</strong> {f.destination}</li>}
          {f.travel_dates && <li><strong>Datas:</strong> {f.travel_dates}</li>}
          {f.pax && <li><strong>Pax:</strong> {f.pax}</li>}
          {f.budget && <li><strong>Orçamento:</strong> {f.budget}</li>}
          {f.notes && <li className="sm:col-span-2"><strong>Obs.:</strong> {f.notes}</li>}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "lead" ? "default" : "outline"} onClick={() => setMode(mode === "lead" ? "none" : "lead")}>
          Criar Lead
        </Button>
        <Button size="sm" variant={mode === "activity" ? "default" : "outline"} onClick={() => setMode(mode === "activity" ? "none" : "activity")}>
          Criar Atividade
        </Button>
      </div>

      {mode === "lead" && <CreateLeadForm result={result} email={email} onDone={() => setMode("none")} />}
      {mode === "activity" && <CreateActivityForm result={result} email={email} onDone={() => setMode("none")} />}
    </div>
  );
}


function AssigneeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { user } = useAuth();
  const { subordinates } = useSubordinates();
  const meName = (user?.user_metadata as any)?.full_name || user?.email || "Eu";
  if (!user) return null;
  return (
    <select
      value={value || user.id}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value={user.id}>{meName} (eu)</option>
      {subordinates.map((s: Subordinate) => (
        <option key={s.user_id} value={s.user_id}>{s.full_name} ({s.role})</option>
      ))}
    </select>
  );
}

async function resolveEmailRowId(userId: string, gmailId?: string | null): Promise<string | null> {
  if (!gmailId) return null;
  const { data } = await supabase.from("emails").select("id").eq("user_id", userId).eq("gmail_id", gmailId).maybeSingle();
  return data?.id ?? null;
}

function emailSnapshot(email: any | undefined) {
  if (!email) return { source_email_subject: null, source_email_from: null, source_email_snippet: null, source_email_received_at: null };
  const snippet = (email.text || email.snippet || "").toString().replace(/\s+/g, " ").trim().slice(0, 2000);
  return {
    source_email_subject: email.subject ?? null,
    source_email_from: email.from ?? null,
    source_email_snippet: snippet || null,
    source_email_received_at: email.date ? new Date(email.date).toISOString() : null,
  };
}

function CreateLeadForm({ result, email, onDone }: { result: EmailAiResult; email?: any; onDone: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const f = result.suggestion.fields;
  const [form, setForm] = useState({
    name: f.contact_name || "",
    email: f.contact_email || "",
    phone: f.contact_phone || "",
    destination: f.destination || "",
    estimated_value: f.budget?.replace(/[^\d.]/g, "") || "",
    notes: [f.travel_dates && `Datas: ${f.travel_dates}`, f.pax && `Pax: ${f.pax}`, f.notes].filter(Boolean).join("\n") + (result.summary ? `\n\nResumo IA: ${result.summary}` : ""),
  });
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    const sourceEmailId = await resolveEmailRowId(user.id, email?.gmailId);
    const snap = emailSnapshot(email);
    const { data, error } = await supabase.from("leads").insert({
      name: form.name.slice(0, 200),
      email: form.email || null,
      phone: form.phone || null,
      destination: form.destination || null,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      notes: form.notes || null,
      status: "novo" as const,
      created_by: user.id,
      assigned_to: assignedTo || user.id,
      source_email_id: sourceEmailId,
      ...snap,
    }).select("id").maybeSingle();
    if (!error && data?.id && sourceEmailId) {
      await supabase.from("emails").update({ lead_id: data.id }).eq("id", sourceEmailId);
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead criado com email anexado.", {
      action: data?.id ? { label: "Abrir", onClick: () => navigate({ to: "/leads/$leadId", params: { leadId: data.id } }) } : undefined,
    });
    onDone();
  };

  return (
    <div className="rounded border bg-white/80 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><Label className="text-xs">Nome*</Label><Input className="h-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label className="text-xs">Email</Label><Input className="h-9" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label className="text-xs">Telefone</Label><Input className="h-9" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label className="text-xs">Destino</Label><Input className="h-9" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
        <div><Label className="text-xs">Valor estimado</Label><Input className="h-9" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} /></div>
        <div><Label className="text-xs">Responsável</Label><AssigneeSelect value={assignedTo} onChange={setAssignedTo} /></div>
      </div>
      <div><Label className="text-xs">Observações</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Criar Lead
        </Button>
      </div>
    </div>
  );
}

function CreateActivityForm({ result, onDone }: { result: EmailAiResult; onDone: () => void }) {
  const { user } = useAuth();
  const f = result.suggestion.fields;
  const defaultPrio: "alta" | "media" | "baixa" = result.priority === "alta" ? "alta" : result.priority === "baixa" ? "baixa" : "media";
  const [form, setForm] = useState({
    title: result.suggestion.title || (f.contact_name ? `Atender ${f.contact_name}` : "Atividade do email"),
    description: [
      f.contact_name && `Contato: ${f.contact_name}`,
      f.contact_email && `Email: ${f.contact_email}`,
      f.contact_phone && `Telefone: ${f.contact_phone}`,
      f.notes,
      result.summary && `\nResumo IA: ${result.summary}`,
    ].filter(Boolean).join("\n"),
    due_date: "",
    priority: defaultPrio,
  });
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (!form.title.trim()) { toast.error("Informe o título"); return; }
    setSaving(true);
    const target = assignedTo || user.id;
    const { data, error } = await supabase.from("tasks").insert({
      title: form.title.slice(0, 200),
      description: form.description || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      priority: form.priority,
      category: "suporte",
      source: "email_ai",
      created_by: user.id,
      assigned_to: target,
    }).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (data?.id && target !== user.id) {
      notifyTaskAssigned({ data: { taskId: data.id } }).catch(() => undefined);
    }
    toast.success("Atividade criada.");
    onDone();
  };

  return (
    <div className="rounded border bg-white/80 p-3 space-y-2">
      <div><Label className="text-xs">Título*</Label><Input className="h-9" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div><Label className="text-xs">Vencimento</Label><Input type="datetime-local" className="h-9" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
        <div>
          <Label className="text-xs">Prioridade</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })}>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
        <div><Label className="text-xs">Responsável</Label><AssigneeSelect value={assignedTo} onChange={setAssignedTo} /></div>
      </div>
      <div><Label className="text-xs">Descrição</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Criar Atividade
        </Button>
      </div>
    </div>
  );
}

