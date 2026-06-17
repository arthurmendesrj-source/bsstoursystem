import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/accept-invite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
        setEmail(data.session.user.email ?? "");
        const meta = (data.session.user.user_metadata ?? {}) as Record<string, unknown>;
        const existing = (meta.full_name as string) || (meta.name as string) || "";
        if (existing) setFullName(existing);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") && session) {
        setReady(true);
        setEmail(session.user.email ?? "");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta ativada! Bem-vindo(a).");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-6">
        <h1 className="mb-2 text-2xl font-semibold">Aceitar convite</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Defina seu nome e senha para ativar sua conta.
        </p>
        {!ready ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Não detectamos um convite válido. Abra novamente o link de convite enviado para o
              seu e-mail. Se ele já foi usado ou expirou, peça ao administrador para reenviar.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
              Ir para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {email && (
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={email} disabled />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Ativando..." : "Ativar conta"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
