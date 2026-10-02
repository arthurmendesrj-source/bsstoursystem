import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) setReady(true);
    });

    (async () => {
      const qp = new URLSearchParams(window.location.search);
      const hp = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const errCode = qp.get("error_code") || hp.get("error_code");
      const err = qp.get("error") || hp.get("error");
      if (err || errCode) {
        window.history.replaceState({}, "", window.location.pathname);
        setErrorMsg(
          errCode === "otp_expired"
            ? "Este link expirou ou já foi usado. Solicite um novo em \"Esqueci minha senha\"."
            : qp.get("error_description") || hp.get("error_description") || "Link inválido.",
        );
        return;
      }

      const tokenHash = qp.get("token_hash") || hp.get("token_hash");
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        window.history.replaceState({}, "", window.location.pathname);
        if (error) setErrorMsg(error.message);
        else setReady(true);
        return;
      }

      const code = qp.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, "", window.location.pathname);
        if (error) setErrorMsg(error.message);
        else setReady(true);
        return;
      }

      const at = hp.get("access_token");
      const rt = hp.get("refresh_token");
      if (at && rt) {
        const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        window.history.replaceState({}, "", window.location.pathname);
        if (error) setErrorMsg(error.message);
        else setReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha redefinida com sucesso!");
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-2xl font-semibold">Redefinir senha</h1>
        {errorMsg ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
              Voltar ao login
            </Button>
          </div>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">
            Abra o link de recuperação enviado para o seu e-mail para continuar.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
