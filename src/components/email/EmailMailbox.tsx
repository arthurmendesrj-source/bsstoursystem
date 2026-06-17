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
import { Loader2, Mail, RefreshCw, Send, Plus, Reply, Inbox as InboxIcon, MailCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMessagesFn, fetchMessageFn, sendEmailFn } from "@/lib/email.functions";

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
  const fetchOne = useServerFn(fetchMessageFn);
  const send = useServerFn(sendEmailFn);

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
  const [listCollapsed, setListCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("email:list:collapsed") === "1";
  });
  const [listWidth, setListWidth] = useState<number>(() => {
    if (typeof window === "undefined") return LIST_DEFAULT;
    const v = Number(localStorage.getItem("email:list:width"));
    return Number.isFinite(v) && v >= LIST_MIN && v <= LIST_MAX ? v : LIST_DEFAULT;
  });
  useEffect(() => { try { localStorage.setItem("email:list:collapsed", listCollapsed ? "1" : "0"); } catch {} }, [listCollapsed]);
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
  const refresh = async () => {
    const myId = ++refreshIdRef.current;
    setLoading(true);
    setFetchError(null);
    const safety = setTimeout(() => {
      if (refreshIdRef.current === myId) {
        setLoading(false);
        setFetchError("Tempo esgotado ao atualizar os emails. Verifique sua conexão e tente novamente.");
        toast.error("Tempo esgotado ao atualizar os emails.");
      }
    }, 60_000);
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
      clearTimeout(safety);
      if (refreshIdRef.current === myId) setLoading(false);
    }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder, targetUserId]);

  useEffect(() => {
    if (selectedUid == null) { setSelected(null); return; }
    let cancel = false;
    (async () => {
      try {
        const r = await fetchOne({ data: { targetUserId, folder, uid: selectedUid } });
        if (!cancel) setSelected(r);
      } catch (e: any) {
        if (!cancel) toast.error(e?.message ?? "Falha ao abrir mensagem");
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUid, folder, targetUserId]);

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
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
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
                            {folder === "inbox" && m.unread && (
                              <Badge variant="secondary" className="mt-1 text-[10px]">Não lido</Badge>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
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
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setComposing({
                    to: folder === "inbox" ? extractEmail(selected.from) : extractEmail(selected.to),
                    subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject ?? ""}`,
                    body: `\n\n---\nEm ${selected.date ? new Date(selected.date).toLocaleString() : ""}, ${selected.from} escreveu:\n${quote(selected.text)}`,
                    inReplyTo: selected.messageId ?? undefined,
                  })}>
                    <Reply className="h-4 w-4 mr-1" />Responder
                  </Button>
                </div>
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
