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
              onClick={async () => {
                if (!email) {
                  toast.error("Digite seu e-mail acima primeiro");
                  return;
                }
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) toast.error(error.message);
                else toast.success("Enviamos um link de recuperação para seu e-mail.");
              }}
            >
              Esqueci minha senha
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
