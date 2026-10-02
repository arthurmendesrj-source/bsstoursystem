import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LoginErrorBoundary, clearSupabaseLocalSession } from "@/components/LoginErrorBoundary";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestPasswordResetCode, confirmPasswordResetCode } from "@/lib/password-reset.functions";

const RECOVERY_FLAG = "login-recovery-attempted";

export const Route = createFileRoute("/login")({
  component: LoginRoute,
  errorComponent: ({ error }) => {
    if (typeof window !== "undefined") {
      const tried = window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
      clearSupabaseLocalSession();
      if (!tried) {
        window.sessionStorage.setItem(RECOVERY_FLAG, "1");
        window.location.reload();
      }
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold">Restaurando sessão...</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  },
});

function LoginRoute() {
  return (
    <LoginErrorBoundary>
      <LoginPage />
    </LoginErrorBoundary>
  );
}

function LoginPage() {
  const { user, signIn, signUp, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // Se o usuário chegou aqui via link de convite, redireciona para /accept-invite
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isRecovery =
      hash.includes("type=recovery") || /[?&]type=recovery\b/.test(search);
    if (isRecovery) {
      window.location.replace(`/reset-password${search}${hash}`);
      return;
    }
    const isInvite =
      hash.includes("type=invite") ||
      hash.includes("type=signup") ||
      /[?&]type=(invite|signup)\b/.test(search) ||
      /[?&]token_hash=/.test(search) ||
      /[?&]code=/.test(search);
    if (isInvite) {
      window.location.replace(`/accept-invite${search}${hash}`);
    }
  }, []);

  // Preventive: if getSession throws (corrupted token), clean and reload once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await supabase.auth.getSession();
      } catch {
        if (cancelled || typeof window === "undefined") return;
        const tried = window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
        clearSupabaseLocalSession();
        if (!tried) {
          window.sessionStorage.setItem(RECOVERY_FLAG, "1");
          window.location.reload();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && user) {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(RECOVERY_FLAG);
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "signin") {
      const { error } = await signIn(email, password);
      if (error) toast.error(t("invalidCredentials"));
      else navigate({ to: "/dashboard" });
    } else {
      const { error } = await signUp(email, password, fullName);
      if (error) toast.error(error);
      else toast.success(t("accountCreated"));
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="hidden flex-1 flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold">{t("appName")}</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-bold tracking-tight">{t("welcomeBack")}</h1>
          <p className="mt-3 text-muted-foreground">{t("appTagline")}</p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} TurismoCRM</div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-6 lg:hidden">
            <div className="mb-2 flex items-center gap-2">
              <Plane className="h-5 w-5 text-primary" />
              <span className="font-semibold">{t("appName")}</span>
            </div>
          </div>
          <h2 className="mb-4 text-2xl font-semibold">{mode === "signin" ? t("login") : t("signup")}</h2>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("loading") : mode === "signin" ? t("login") : t("signup")}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? t("noAccount") : t("haveAccount")}
          </button>
          {mode === "signin" && (
            <button
              type="button"
              className="mt-2 w-full text-sm text-primary hover:underline"
              onClick={() => setResetOpen(true)}
            >
              Esqueci minha senha
            </button>
          )}
          <ResetDialog open={resetOpen} onOpenChange={setResetOpen} initialEmail={email} onDone={(em) => { setEmail(em); setPassword(""); }} />
        </Card>
      </div>
    </div>
  );
}

function ResetDialog({
  open,
  onOpenChange,
  initialEmail,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialEmail: string;
  onDone: (email: string) => void;
}) {
  const requestFn = useServerFn(requestPasswordResetCode);
  const confirmFn = useServerFn(confirmPasswordResetCode);
  const [step, setStep] = useState<"email" | "code">("email");
  const [em, setEm] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("email");
      setEm(initialEmail);
      setCode("");
      setPw("");
      setPw2("");
    }
  }, [open, initialEmail]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await requestFn({ data: { email: em } });
      toast.success("Se o e-mail estiver cadastrado, você receberá um código de 6 dígitos.");
      setStep("code");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao enviar código");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres");
    if (pw !== pw2) return toast.error("As senhas não conferem");
    setBusy(true);
    try {
      const res = await confirmFn({ data: { email: em, code, password: pw } });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Senha redefinida! Faça login com a nova senha.");
        onDone(em);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao redefinir senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
          <DialogDescription>
            {step === "email"
              ? "Informe seu e-mail para receber um código de 6 dígitos."
              : `Digite o código enviado para ${em} e escolha a nova senha.`}
          </DialogDescription>
        </DialogHeader>
        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">E-mail</Label>
              <Input id="reset-email" type="email" value={em} onChange={(e) => setEm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Enviando..." : "Enviar código"}
            </Button>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-code">Código</Label>
              <Input
                id="reset-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-lg tracking-[0.5em]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-pw">Nova senha</Label>
              <Input id="reset-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-pw2">Confirmar nova senha</Label>
              <Input id="reset-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? "Salvando..." : "Redefinir senha"}
            </Button>
            <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep("email")}>
              Reenviar código
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
