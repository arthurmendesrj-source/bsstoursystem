import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { EmailMailbox } from "@/components/email/EmailMailbox";
import { connectGmail, disconnectGmail, getMyAccount } from "@/lib/email.functions";

export const Route = createFileRoute("/email")({
  component: () => (
    <AuthGate>
      <AppShell>
        <EmailPage />
      </AppShell>
    </AuthGate>
  ),
});

function EmailPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const getAcc = useServerFn(getMyAccount);
  const connect = useServerFn(connectGmail);
  const disconnect = useServerFn(disconnectGmail);

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await getAcc();
      setConnected(r.connected);
      setAccountEmail(r.email);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, []);

  const handleConnect = async () => {
    setSubmitting(true);
    const safety = setTimeout(() => setSubmitting(false), 30_000);
    try {
      const r: any = await connect({ data: {} });
      toast.success(`Caixa conectada: ${r?.email ?? ""}`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao conectar", { duration: 8000 });
    } finally {
      clearTimeout(safety);
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Desconectar sua caixa de email?")) return;
    try {
      await disconnect();
      toast.success("Desconectado");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Mail className="h-6 w-6" /> Email
        </h1>
        {connected && (
          <Button variant="ghost" size="sm" onClick={handleDisconnect}>
            <Trash2 className="h-4 w-4 mr-1" /> Desconectar
          </Button>
        )}
      </div>

      {!connected && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Conectar Gmail</CardTitle>
            <CardDescription>
              A caixa de email é conectada via integração oficial do Google (Gmail API).
              Peça ao administrador para conectar uma conta Gmail nas configurações
              de Conectores do workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleConnect} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Verificar conexão
            </Button>
          </CardContent>
        </Card>
      )}

      {connected && userId && (
        <EmailMailbox targetUserId={userId} targetEmail={accountEmail} />
      )}
    </div>
  );
}
