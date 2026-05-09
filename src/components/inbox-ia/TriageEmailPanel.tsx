import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles, RefreshCw, Mail, Check, ExternalLink, Inbox, Star, AlertOctagon, Send, FileText, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { gmailIncrementalSync } from "@/server/gmail-mirror.functions";
import { gmailModify } from "@/server/gmail.functions";
import { AiTriageDialog } from "@/components/email/AiTriageDialog";
import { cn } from "@/lib/utils";

type EmailRow = {
  id: string;
  gmail_id: string;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  internal_date: string | null;
  has_attachments: boolean;
  labels: string[] | null;
  owner_email: string | null;
};

type LabelRow = { id: string; name: string; type: string; owner_email: string };

const SYSTEM_ORDER = ["INBOX", "IMPORTANT", "STARRED", "SENT", "DRAFT", "SPAM", "TRASH"];
const SYSTEM_NAMES: Record<string, string> = {
  INBOX: "Caixa de entrada", IMPORTANT: "Importante", STARRED: "Com estrela",
  SENT: "Enviados", DRAFT: "Rascunhos", SPAM: "Spam", TRASH: "Lixeira",
};
const SYSTEM_ICONS: Record<string, typeof Inbox> = {
  INBOX: Inbox, IMPORTANT: AlertOctagon, STARRED: Star, SENT: Send, DRAFT: FileText, SPAM: AlertOctagon, TRASH: Trash2,
};

const PERIODS: { value: string; label: string; days: number | null }[] = [
  { value: "1", label: "Hoje", days: 1 },
  { value: "7", label: "Últimos 7 dias", days: 7 },
  { value: "30", label: "Últimos 30 dias", days: 30 },
  { value: "90", label: "Últimos 90 dias", days: 90 },
];

const LS_LABEL = "inboxia.email.label";
const LS_PERIOD = "inboxia.email.period";
const LS_ACCOUNT = "inboxia.email.account";

function formatRel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function TriageEmailPanel() {
  const incSyncFn = useServerFn(gmailIncrementalSync);
  const modifyFn = useServerFn(gmailModify);

  const [accounts, setAccounts] = useState<string[]>([]);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [account, setAccount] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem(LS_ACCOUNT) ?? "__all") : "__all"
  );
  const [label, setLabel] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem(LS_LABEL) ?? "INBOX") : "INBOX"
  );
  const [period, setPeriod] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem(LS_PERIOD) ?? "7") : "7"
  );

  const [triageOpen, setTriageOpen] = useState(false);
  const [triageEmail, setTriageEmail] = useState<EmailRow | null>(null);

  useEffect(() => { try { localStorage.setItem(LS_LABEL, label); } catch {} }, [label]);
  useEffect(() => { try { localStorage.setItem(LS_PERIOD, period); } catch {} }, [period]);
  useEffect(() => { try { localStorage.setItem(LS_ACCOUNT, account); } catch {} }, [account]);

  // Load accounts + labels
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data: accs } = await supabase
        .from("user_email_accounts")
        .select("email_address")
        .eq("user_id", uid);
      const list = ((accs ?? []) as Array<{ email_address: string }>).map((r) => r.email_address.toLowerCase());
      setAccounts(list);
      if (list.length === 0) return;
      const { data: lbls } = await supabase
        .from("email_labels")
        .select("id, name, type, owner_email")
        .in("owner_email", list)
        .order("name");
      setLabels((lbls ?? []) as LabelRow[]);
    })();
  }, []);

  const targetAccounts = useMemo(
    () => (account === "__all" ? accounts : [account]),
    [account, accounts]
  );

  const loadEmails = useCallback(async () => {
    if (targetAccounts.length === 0) { setEmails([]); return; }
    setLoading(true);
    try {
      const days = Number(period) || 7;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("emails")
        .select("id, gmail_id, thread_id, from_email, from_name, subject, snippet, internal_date, has_attachments, labels, owner_email")
        .in("owner_email", targetAccounts)
        .eq("is_unread", true)
        .contains("labels", [label])
        .gte("internal_date", cutoff)
        .order("internal_date", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      setEmails((data ?? []) as EmailRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar emails");
    } finally {
      setLoading(false);
    }
  }, [targetAccounts, label, period]);

  useEffect(() => { void loadEmails(); }, [loadEmails]);

  const refreshFromGmail = useCallback(async () => {
    setSyncing(true);
    try {
      await incSyncFn({ data: undefined as never });
      toast.success("Sincronizado com o Gmail");
      await loadEmails();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }, [incSyncFn, loadEmails]);

  const markAsRead = useCallback(async (em: EmailRow) => {
    try {
      await modifyFn({ data: { id: em.gmail_id, removeLabelIds: ["UNREAD"] } });
      await supabase.from("emails").update({ is_unread: false }).eq("id", em.id);
      if (em.thread_id) await supabase.from("email_threads").update({ is_unread: false }).eq("id", em.thread_id);
      setEmails((prev) => prev.filter((x) => x.id !== em.id));
      toast.success("Marcado como lido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }, [modifyFn]);

  const openTriage = (em: EmailRow) => { setTriageEmail(em); setTriageOpen(true); };
  const onTriageClose = (open: boolean) => {
    setTriageOpen(open);
    if (!open && triageEmail) {
      // Triagem concluída — remove da lista (criou lead/atividade/ignorou).
      setEmails((prev) => prev.filter((x) => x.id !== triageEmail.id));
      setTriageEmail(null);
    }
  };

  const labelOptions = useMemo(() => {
    const sys = SYSTEM_ORDER.map((id) => ({
      id,
      name: SYSTEM_NAMES[id] ?? id,
      type: "system" as const,
    }));
    const user = Array.from(
      new Map(
        labels
          .filter((l) => l.type === "user")
          .map((l) => [l.id, { id: l.id, name: l.name, type: "user" as const }])
      ).values()
    ).sort((a, b) => a.name.localeCompare(b.name));
    return [...sys, ...user];
  }, [labels]);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center space-y-3">
        <Mail className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="font-semibold">Nenhuma conta de email vinculada</h2>
        <p className="text-sm text-muted-foreground">
          Vincule uma conta de email para começar a usar a triagem com IA.
        </p>
        <Button asChild>
          <Link to="/email">Ir para Email</Link>
        </Button>
      </div>
    );
  }

  const LabelIcon = SYSTEM_ICONS[label] ?? Inbox;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Triagem de Email
        </h1>
        <p className="text-sm text-muted-foreground">
          Selecione pasta e período. Use <strong>Triagem IA</strong> para criar lead, atividade ou ignorar — sem abrir o e-mail.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        {accounts.length > 1 && (
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas as contas</SelectItem>
              {accounts.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={label} onValueChange={setLabel}>
          <SelectTrigger className="w-[220px] h-9">
            <div className="flex items-center gap-2"><LabelIcon className="h-4 w-4" /><SelectValue /></div>
          </SelectTrigger>
          <SelectContent>
            {labelOptions.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void refreshFromGmail()} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar do Gmail
        </Button>
      </div>

      <div className="text-xs text-muted-foreground px-1">
        {loading ? "Carregando…" : `${emails.length} e-mail(s) não lido(s) · ${periodLabel}`}
      </div>

      <ScrollArea className="h-[calc(100vh-280px)] rounded-lg border bg-card">
        {emails.length === 0 && !loading && (
          <div className="p-10 text-center text-sm text-muted-foreground space-y-3">
            <Mail className="h-8 w-8 mx-auto opacity-50" />
            <p>Nenhum e-mail não lido neste período.</p>
            <Button variant="outline" size="sm" onClick={() => void refreshFromGmail()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar do Gmail
            </Button>
          </div>
        )}
        <ul className="divide-y">
          {emails.map((em) => (
            <li key={em.id} className={cn("px-4 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors")}>
              <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate">{em.from_name || em.from_email || "(sem remetente)"}</span>
                  {em.from_name && em.from_email && (
                    <span className="text-xs text-muted-foreground truncate">· {em.from_email}</span>
                  )}
                  {accounts.length > 1 && em.owner_email && (
                    <Badge variant="outline" className="ml-auto text-[10px]">{em.owner_email}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRel(em.internal_date)}</span>
                </div>
                <div className="text-sm font-medium truncate mt-0.5">{em.subject || "(sem assunto)"}</div>
                {em.snippet && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{em.snippet}</div>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Button size="sm" onClick={() => openTriage(em)}>
                  <Sparkles className="h-4 w-4 mr-1" /> Triagem IA
                </Button>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" asChild title="Abrir no Email">
                    <a href={`/email?thread=${encodeURIComponent(em.thread_id ?? "")}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void markAsRead(em)} title="Marcar como lido">
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>

      <AiTriageDialog
        open={triageOpen}
        onOpenChange={onTriageClose}
        gmailId={triageEmail?.gmail_id ?? null}
        threadId={triageEmail?.thread_id ?? null}
        fromEmail={triageEmail?.from_email ?? undefined}
        fromName={triageEmail?.from_name ?? undefined}
        subject={triageEmail?.subject ?? undefined}
      />
    </div>
  );
}
