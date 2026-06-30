import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { EmailMailbox } from "@/components/email/EmailMailbox";
import { getMyAccount } from "@/lib/email.functions";

export const Route = createFileRoute("/inbox-ia/email")({
  component: () => (
    <AuthGate>
      <AppShell>
        <TriageEmailPage />
      </AppShell>
    </AuthGate>
  ),
});

function TriageEmailPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const getAcc = useServerFn(getMyAccount);

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getAcc();
        setConnected(r.connected);
        setAccountEmail(r.email);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Triagem Email
        </h1>
      </div>

      {!connected && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Conecte seu Gmail</CardTitle>
            <CardDescription>
              Conecte sua caixa de email em <strong>Email</strong> no menu lateral
              para começar a triagem com IA.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}

      {connected && userId && (
        <EmailMailbox targetUserId={userId} targetEmail={accountEmail} />
      )}
    </div>
  );
}
