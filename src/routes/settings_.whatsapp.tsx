import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  connectWhatsappAccount,
  disconnectWhatsappAccount,
  listWhatsappAccounts,
  syncWhatsappTemplates,
} from "@/server/whatsapp.functions";

export const Route = createFileRoute("/settings_/whatsapp")({
  component: () => (
    <AuthGate>
      <AppShell>
        <WhatsappSettingsPage />
      </AppShell>
    </AuthGate>
  ),
});

type Account = {
  id: string;
  display_phone: string;
  display_name: string | null;
  status: string;
  phone_number_id: string;
  waba_id: string;
  webhook_verify_token: string;
  connected_at: string;
};

function WhatsappSettingsPage() {
  const list = useServerFn(listWhatsappAccounts);
  const connect = useServerFn(connectWhatsappAccount);
  const disconnect = useServerFn(disconnectWhatsappAccount);
  const syncTpl = useServerFn(syncWhatsappTemplates);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/whatsapp/webhook`;

  const reload = async () => {
    setLoading(true);
    try {
      const r = await list();
      setAccounts(r.accounts as Account[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await connect({
        data: { phoneNumberId, wabaId, accessToken, appSecret: appSecret || undefined },
      });
      toast.success("Número conectado!");
      setPhoneNumberId(""); setWabaId(""); setAccessToken(""); setAppSecret("");
      setShowForm(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm("Desconectar este número?")) return;
    try {
      await disconnect({ data: { accountId } });
      toast.success("Desconectado");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const handleSync = async (accountId: string) => {
    try {
      const r = await syncTpl({ data: { accountId } });
      toast.success(`${r.count} template(s) sincronizado(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WhatsApp Business</h1>
        <p className="text-muted-foreground">
          Conecte seu número WhatsApp Business via Meta Cloud API.
        </p>
      </div>

      <Card className="p-6 space-y-3 bg-muted/40">
        <h2 className="font-semibold">Como conectar (passo a passo)</h2>
        <ol className="list-decimal list-inside text-sm space-y-2">
          <li>
            Acesse <a className="underline" href="https://business.facebook.com" target="_blank" rel="noreferrer">business.facebook.com</a> e crie/abra sua <strong>Conta Comercial WhatsApp (WABA)</strong>.
          </li>
          <li>
            Em <a className="underline" href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a>, crie um <strong>App</strong> e adicione o produto <strong>WhatsApp</strong>.
          </li>
          <li>
            Cadastre seu número de telefone no painel do WhatsApp e anote o <strong>Phone Number ID</strong> e o <strong>WhatsApp Business Account ID (WABA ID)</strong>.
          </li>
          <li>
            Em <strong>Business Settings → System Users</strong>, gere um <strong>System User Token</strong> permanente com permissões <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.
          </li>
          <li>
            (Opcional, recomendado) Copie o <strong>App Secret</strong> em <em>App Settings → Basic</em> para validar assinaturas de webhook.
          </li>
          <li>
            Cole as credenciais abaixo. Depois, configure o webhook no painel da Meta com a URL e o token gerados.
          </li>
        </ol>
      </Card>

      {!showForm ? (
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> Conectar novo número
        </Button>
      ) : (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Novo número WhatsApp</h3>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Phone Number ID</Label>
              <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" required />
            </div>
            <div>
              <Label>WhatsApp Business Account ID (WABA ID)</Label>
              <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="987654321098765" required />
            </div>
            <div>
              <Label>System User Access Token</Label>
              <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAG..." required />
            </div>
            <div>
              <Label>App Secret (opcional, para validar webhook)</Label>
              <Input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>{submitting ? "Conectando..." : "Conectar"}</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Números conectados</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum número conectado ainda.</p>
        ) : (
          accounts.map((a) => (
            <Card key={a.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{a.display_name ?? a.display_phone}</div>
                  <div className="text-sm text-muted-foreground">{a.display_phone}</div>
                  <Badge variant={a.status === "active" ? "default" : "destructive"} className="mt-1">{a.status}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleSync(a.id)}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Templates
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDisconnect(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 border-t pt-3">
                <div className="text-sm font-medium">Configure no painel da Meta:</div>
                <div className="space-y-1">
                  <Label className="text-xs">Callback URL</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copy(webhookUrl)}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Verify Token</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={a.webhook_verify_token} className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copy(a.webhook_verify_token)}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Inscreva-se nos campos <code>messages</code> em <strong>WhatsApp → Configuration → Webhook</strong>.
                </p>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
