import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Inbox as InboxIcon, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  fetchInbox,
  fetchEmailBody,
  sendEmailViaSmtp,
  markEmailAsRead,
} from "@/lib/email-smtp.functions";

type Msg = {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  date: string | null;
  flags: string[];
  preview: string;
};

type Body = {
  subject: string | null;
  from?: string | null;
  to?: string | null;
  date?: string | null;
  html: string | null;
  text: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function SmtpInbox({ accountId, email, className }: { accountId: string; email: string; className?: string }) {
  const fetchInboxFn = useServerFn(fetchInbox);
  const fetchBodyFn = useServerFn(fetchEmailBody);
  const sendFn = useServerFn(sendEmailViaSmtp);
  const markReadFn = useServerFn(markEmailAsRead);

  const [mailbox, setMailbox] = useState<"INBOX" | "SENT">("INBOX");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [body, setBody] = useState<Body | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const mailboxNames = useMemo(() => {
    if (mailbox === "INBOX") return ["INBOX"];
    // Common provider names for "Sent"
    return ["[Gmail]/Sent Mail", "Sent", "Sent Items", "Enviados", "INBOX.Sent"];
  }, [mailbox]);

  const load = useCallback(async () => {
    setLoading(true);
    setBody(null);
    setSelectedUid(null);
    try {
      let lastErr: unknown = null;
      for (const mb of mailboxNames) {
        try {
          const r = await fetchInboxFn({ data: { accountId, mailbox: mb, limit: 50 } });
          setMessages(r.messages as Msg[]);
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr ?? new Error("Falha ao carregar a caixa");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar emails");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, fetchInboxFn, mailboxNames]);

  useEffect(() => { void load(); }, [load]);

  const openMessage = async (m: Msg) => {
    setSelectedUid(m.uid);
    setBody(null);
    setBodyLoading(true);
    try {
      const r = await fetchBodyFn({ data: { accountId, mailbox: mailboxNames[0] ?? "INBOX", uid: m.uid } });
      setBody(r as Body);
      if (m.flags && !m.flags.includes("\\Seen")) {
        try {
          await markReadFn({ data: { accountId, mailbox: mailboxNames[0] ?? "INBOX", uid: m.uid, read: true } });
          setMessages((prev) => prev.map((x) => (x.uid === m.uid ? { ...x, flags: [...x.flags, "\\Seen"] } : x)));
        } catch { /* noop */ }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir email");
    } finally {
      setBodyLoading(false);
    }
  };

  const send = async () => {
    const tos = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (tos.length === 0) { toast.error("Informe ao menos um destinatário"); return; }
    if (!subject.trim()) { toast.error("Informe o assunto"); return; }
    setSending(true);
    try {
      await sendFn({ data: { accountId, to: tos, subject, text } });
      toast.success("Enviado");
      setComposeOpen(false);
      setTo(""); setSubject(""); setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn("flex h-[calc(100vh-4rem)] bg-background", className)}>
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r flex flex-col bg-background">
        <div className="p-2 border-b flex items-center gap-2">
          <Button onClick={() => void load()} disabled={loading} size="sm" className="flex-1 justify-start gap-2">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
        <div className="p-2">
          <Button onClick={() => setComposeOpen(true)} size="sm" className="w-full justify-start gap-2 mb-2" variant="default">
            <Send className="h-4 w-4" /> Novo email
          </Button>
          <button
            onClick={() => setMailbox("INBOX")}
            className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-r-full text-sm",
              mailbox === "INBOX" ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted text-foreground/80")}
          >
            <InboxIcon className="h-4 w-4" /> Caixa de entrada
          </button>
          <button
            onClick={() => setMailbox("SENT")}
            className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-r-full text-sm",
              mailbox === "SENT" ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted text-foreground/80")}
          >
            <Send className="h-4 w-4" /> Enviados
          </button>
        </div>
        <div className="mt-auto p-2 border-t text-xs text-muted-foreground truncate" title={email}>
          <Mail className="h-3 w-3 inline mr-1" />{email}
        </div>
      </aside>

      {/* Message list */}
      <div className="w-[380px] shrink-0 border-r min-h-0 overflow-auto">
        {loading && messages.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma mensagem</div>
        ) : (
          <ul>
            {messages.map((m) => {
              const unread = !m.flags?.includes("\\Seen");
              return (
                <li key={m.uid}>
                  <button
                    onClick={() => void openMessage(m)}
                    className={cn("w-full text-left px-3 py-2.5 border-b flex flex-col gap-0.5",
                      selectedUid === m.uid ? "bg-primary/10" : "hover:bg-muted/50",
                      unread && "bg-card font-medium")}
                  >
                    <div className="flex items-baseline gap-2">
                      <div className={cn("text-sm truncate flex-1", unread && "font-semibold")}>{m.from || "(sem remetente)"}</div>
                      <div className="text-xs text-muted-foreground shrink-0">{formatDate(m.date)}</div>
                    </div>
                    <div className="text-sm truncate">{m.subject || "(sem assunto)"}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Reader */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selectedUid ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Selecione uma mensagem</div>
        ) : bodyLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando mensagem…</div>
        ) : body ? (
          <article className="p-6 max-w-3xl mx-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold">{body.subject || "(sem assunto)"}</h2>
                <div className="text-sm text-muted-foreground mt-1">
                  {body.from && <div>De: {body.from}</div>}
                  {body.to && <div>Para: {body.to}</div>}
                  {body.date && <div>{new Date(body.date).toLocaleString("pt-BR")}</div>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setSelectedUid(null); setBody(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {body.html ? (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: body.html }} />
            ) : body.text ? (
              <pre className="whitespace-pre-wrap text-sm font-sans">{body.text}</pre>
            ) : (
              <div className="text-sm text-muted-foreground">(mensagem vazia)</div>
            )}
          </article>
        ) : null}
      </div>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Novo email</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Para</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemplo.com, outro@exemplo.com" /></div>
            <div><Label>Assunto</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div><Label>Mensagem</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancelar</Button>
            <Button onClick={send} disabled={sending}>{sending ? "Enviando…" : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
