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

type Status = "verifying" | "ready" | "invalid";

function parseHashParams(hash: string): Record<string, string> {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const out: Record<string, string> = {};
  for (const part of h.split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
}

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const finalize = (session: import("@supabase/supabase-js").Session | null) => {
      if (cancelled) return;
      if (!session) {
        setStatus("invalid");
        return;
      }
      setEmail(session.user.email ?? "");
      const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
      const existing = (meta.full_name as string) || (meta.name as string) || "";
      if (existing) setFullName(existing);
      setStatus("ready");
    };

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const qp = url.searchParams;
        const hp = parseHashParams(window.location.hash || "");

        // 0) Supabase devolveu erro no hash (ex: otp_expired / access_denied)
        const hashError = hp["error"] || qp.get("error");
        const hashErrorCode = hp["error_code"] || qp.get("error_code");
        const hashErrorDesc = hp["error_description"] || qp.get("error_description");
        if (hashError || hashErrorCode) {
          window.history.replaceState({}, "", window.location.pathname);
          const friendly =
            hashErrorCode === "otp_expired"
              ? "Este link de convite expirou ou já foi utilizado. Peça ao administrador para reenviar o convite."
              : (hashErrorDesc || hashError || "Convite inválido.");
          setErrorMsg(friendly);
          setStatus("invalid");
          return;
        }


        // 1) PKCE / token_hash flow (most common for Supabase invites)
        const tokenHash = qp.get("token_hash") || hp["token_hash"];
        const type = (qp.get("type") || hp["type"] || "invite") as
          | "invite"
          | "signup"
          | "magiclink"
          | "recovery"
          | "email_change";

        if (tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
          });
          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
          if (error) {
            setErrorMsg(error.message);
            setStatus("invalid");
            return;
          }
          finalize(data.session);
          return;
        }

        // 2) Implicit flow with access_token in hash
        const accessToken = hp["access_token"];
        const refreshToken = hp["refresh_token"];
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          window.history.replaceState({}, "", window.location.pathname);
          if (error) {
            setErrorMsg(error.message);
            setStatus("invalid");
            return;
          }
          finalize(data.session);
          return;
        }

        // 3) PKCE code= flow
        const code = qp.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          window.history.replaceState({}, "", window.location.pathname);
          if (error) {
            setErrorMsg(error.message);
            setStatus("invalid");
            return;
          }
          finalize(data.session);
          return;
        }

        // 4) Maybe session is already established
        const { data } = await supabase.auth.getSession();
        finalize(data.session);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Erro ao validar convite");
        setStatus("invalid");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
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

        {status === "verifying" && (
          <p className="text-sm text-muted-foreground">Validando convite…</p>
        )}

        {status === "invalid" && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              {errorMsg ||
                "Não foi possível validar este convite. O link pode ter expirado ou já ter sido utilizado. Peça ao administrador para reenviar."}
            </p>

            <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
              Ir para o login
            </Button>
          </div>
        )}

        {status === "ready" && (
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
