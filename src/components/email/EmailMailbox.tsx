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

  const refresh = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const r: any = await list({ data: { targetUserId, folder, search } });
      setMessages(r.messages ?? []);
      setNotConnected(r.connected === false);
      setFetchError(r.error ?? null);
      if (r.error) toast.error(r.error);
    } catch (e: any) {
      setFetchError(e?.message ?? "Falha ao listar mensagens");
      toast.error(e?.message ?? "Falha ao listar mensagens");
    } finally {
      setLoading(false);
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

      <div className="grid grid-cols-1 md:grid-cols-[auto_380px_1fr] gap-3">
        <MailboxSidebar
          folder={folder}
          onChange={(f) => { setFolder(f); setSelectedUid(null); }}
        />

        <Card>
          <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
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
