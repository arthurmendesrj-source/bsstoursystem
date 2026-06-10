import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import {
  testEmailConnection,
  saveEmailAccount,
  listEmailAccounts,
  deleteEmailAccount,
} from "@/lib/email-smtp.functions";

type ProviderId = "gmail" | "outlook" | "yahoo" | "icloud" | "other";

type Preset = {
  label: string;
  smtp_host: string; smtp_port: number; smtp_secure: boolean;
  imap_host: string; imap_port: number; imap_secure: boolean;
  appPasswordHelpUrl?: string;
  notes?: string;
};

const PRESETS: Record<Exclude<ProviderId, "other">, Preset> = {
  gmail: {
    label: "Gmail",
    smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_secure: true,
    imap_host: "imap.gmail.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://myaccount.google.com/apppasswords",
    notes: "Gmail exige senha de app (2FA obrigatório).",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    smtp_host: "smtp-mail.outlook.com", smtp_port: 587, smtp_secure: false,
    imap_host: "outlook.office365.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://account.microsoft.com/security",
    notes: "Pode exigir senha de app se 2FA estiver ativo.",
  },
  yahoo: {
    label: "Yahoo Mail",
    smtp_host: "smtp.mail.yahoo.com", smtp_port: 465, smtp_secure: true,
    imap_host: "imap.mail.yahoo.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://login.yahoo.com/account/security",
    notes: "Gere uma senha de app em Account Security.",
  },
  icloud: {
    label: "iCloud Mail",
    smtp_host: "smtp.mail.me.com", smtp_port: 587, smtp_secure: false,
    imap_host: "imap.mail.me.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://appleid.apple.com/account/manage",
    notes: "Use uma senha específica de app (App-Specific Password).",
  },
};

type Account = {
  id: string;
  provider: string;
  email_address: string;
  display_name: string | null;
  smtp_host: string;
  imap_host: string;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
};

function fmt(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export function SmtpEmailConnectCard() {
  const listFn = useServerFn(listEmailAccounts);
  const testFn = useServerFn(testEmailConnection);
  const saveFn = useServerFn(saveEmailAccount);
  const delFn = useServerFn(deleteEmailAccount);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [provider, setProvider] = useState<ProviderId>("gmail");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState(PRESETS.gmail.smtp_host);
  const [smtpPort, setSmtpPort] = useState<number>(PRESETS.gmail.smtp_port);
  const [smtpSecure, setSmtpSecure] = useState(PRESETS.gmail.smtp_secure);
  const [imapHost, setImapHost] = useState(PRESETS.gmail.imap_host);
  const [imapPort, setImapPort] = useState<number>(PRESETS.gmail.imap_port);
  const [imapSecure, setImapSecure] = useState(PRESETS.gmail.imap_secure);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ smtp: boolean; imap: boolean; smtpErr?: string; imapErr?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listFn() as { accounts: Account[] };
      setAccounts(r.accounts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar contas");
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => { void load(); }, [load]);

  const applyPreset = (id: ProviderId) => {
    setProvider(id);
    setTestResult(null);
    if (id === "other") return;
    const p = PRESETS[id];
    setSmtpHost(p.smtp_host); setSmtpPort(p.smtp_port); setSmtpSecure(p.smtp_secure);
    setImapHost(p.imap_host); setImapPort(p.imap_port); setImapSecure(p.imap_secure);
  };

  const buildPayload = () => ({
    provider,
    email_address: email.trim(),
    display_name: displayName.trim() || undefined,
    smtp_host: smtpHost.trim(), smtp_port: Number(smtpPort), smtp_secure: smtpSecure,
    imap_host: imapHost.trim(), imap_port: Number(imapPort), imap_secure: imapSecure,
    auth_username: email.trim(),
    password,
  });

  const test = async () => {
    if (!email || !password) { toast.error("Informe email e senha"); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await testFn({ data: buildPayload() }) as { smtp: { ok: boolean; error?: string }; imap: { ok: boolean; error?: string } };
      setTestResult({ smtp: r.smtp.ok, imap: r.imap.ok, smtpErr: r.smtp.error, imapErr: r.imap.error });
      if (r.smtp.ok && r.imap.ok) toast.success("Conexão verificada!");
      else toast.error("Falha em pelo menos um dos servidores");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao testar");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!email || !password) { toast.error("Informe email e senha"); return; }
    setSaving(true);
    try {
      await saveFn({ data: buildPayload() });
      toast.success("Conta conectada!");
      setShowForm(false);
      setPassword(""); setEmail(""); setDisplayName(""); setTestResult(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, em: string) => {
    if (!confirm(`Remover ${em}?`)) return;
    try {
      await delFn({ data: { id } });
      toast.success("Conta removida");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    }
  };

  const preset = provider !== "other" ? PRESETS[provider] : null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-5 w-5" /> Email com login e senha (SMTP/IMAP)</h2>
          <p className="text-sm text-muted-foreground">
            Conecte qualquer caixa de email usando o endereço e a senha — sem precisar de OAuth.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>Conectar conta</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : accounts.length === 0 && !showForm ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma conta SMTP/IMAP conectada.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-md border p-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                {a.last_test_ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />}
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.email_address}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    <Badge variant="outline" className="mr-2">{a.provider}</Badge>
                    SMTP {a.smtp_host} · IMAP {a.imap_host} · testado {fmt(a.last_test_at)}
                  </div>
                  {a.last_test_error && (
                    <div className="text-xs text-destructive break-words mt-1">{a.last_test_error}</div>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void remove(a.id, a.email_address)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="border-t pt-4 space-y-4">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select value={provider} onValueChange={(v) => applyPreset(v as ProviderId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail">Gmail</SelectItem>
                <SelectItem value="outlook">Outlook / Microsoft 365</SelectItem>
                <SelectItem value="yahoo">Yahoo Mail</SelectItem>
                <SelectItem value="icloud">iCloud Mail</SelectItem>
                <SelectItem value="other">Outro (configurar manualmente)</SelectItem>
              </SelectContent>
            </Select>
            {preset?.notes && (
              <p className="text-xs text-muted-foreground">
                {preset.notes}{" "}
                {preset.appPasswordHelpUrl && (
                  <a href={preset.appPasswordHelpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Gerar senha de app <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Endereço de email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Nome para exibição (opcional)</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu Nome" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Senha {provider !== "other" && provider !== "outlook" ? "(senha de app)" : ""}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>

          {provider === "other" && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-sm font-medium">SMTP (envio)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-2"><Label>Host SMTP</Label><Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></div>
                <div className="space-y-1"><Label>Porta</Label><Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} /><span className="text-sm">SSL/TLS direto (porta 465). Desligue para STARTTLS (587).</span></div>
              <div className="text-sm font-medium pt-2">IMAP (leitura)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-2"><Label>Host IMAP</Label><Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} /></div>
                <div className="space-y-1"><Label>Porta</Label><Input type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value))} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={imapSecure} onCheckedChange={setImapSecure} /><span className="text-sm">SSL/TLS (porta 993).</span></div>
            </div>
          )}

          {testResult && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className={testResult.smtp ? "text-green-600" : "text-destructive"}>
                {testResult.smtp ? "✓ SMTP OK" : `✗ SMTP: ${testResult.smtpErr ?? "falha"}`}
              </div>
              <div className={testResult.imap ? "text-green-600" : "text-destructive"}>
                {testResult.imap ? "✓ IMAP OK" : `✗ IMAP: ${testResult.imapErr ?? "falha"}`}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setShowForm(false); setTestResult(null); }}>Cancelar</Button>
            <Button variant="outline" onClick={() => void test()} disabled={testing || saving}>
              {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Testar conexão
            </Button>
            <Button onClick={() => void save()} disabled={saving || testing}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar e conectar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
