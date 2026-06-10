import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, AlertCircle, Copy, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { diagnoseGoogleOauth } from "@/lib/google-oauth-diagnose.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/settings_/google-diagnostico")({
  component: () => (
    <AuthGate>
      <AppShell>
        <DiagnosticPage />
      </AppShell>
    </AuthGate>
  ),
});

type Status = "ok" | "error" | "warn" | "pending";

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (s === "error") return <XCircle className="h-5 w-5 text-destructive" />;
  if (s === "warn") return <AlertCircle className="h-5 w-5 text-yellow-600" />;
  return <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />;
}

function Section({
  title,
  status,
  summary,
  children,
}: {
  title: string;
  status: Status;
  summary?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start gap-3">
        <StatusIcon s={status} />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{title}</div>
          {summary && <div className="text-sm text-muted-foreground break-words">{summary}</div>}
          {children && <div className="mt-2">{children}</div>}
        </div>
      </div>
    </Card>
  );
}

function Pre({ data }: { data: unknown }) {
  return (
    <pre className="text-xs bg-muted/40 p-3 rounded overflow-auto max-h-72">
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function DiagnosticPage() {
  const diagnose = useServerFn(diagnoseGoogleOauth);
  const [running, setRunning] = useState(false);
  const [server, setServer] = useState<Awaited<ReturnType<typeof diagnoseGoogleOauth>> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [session, setSession] = useState<{ userId?: string; email?: string; expiresAt?: string; hasToken: boolean } | null>(null);
  const [startProbe, setStartProbe] = useState<{ status: number; location: string | null; body: string | null; error?: string } | null>(null);
  const [popupLog, setPopupLog] = useState<Array<{ ts: string; ok: boolean; message: string }>>([]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri = `${origin}/api/public/google/oauth/callback`;
  const startUrl = `${origin}/api/public/google/oauth/start`;
  const popupBridgeUrl = `${origin}/google-oauth-popup`;

  const runAll = useCallback(async () => {
    setRunning(true);
    setServerError(null);
    setStartProbe(null);

    // 1. Session
    const { data: s } = await supabase.auth.getSession();
    setSession({
      userId: s.session?.user?.id,
      email: s.session?.user?.email ?? undefined,
      expiresAt: s.session?.expires_at ? new Date(s.session.expires_at * 1000).toISOString() : undefined,
      hasToken: !!s.session?.access_token,
    });

    // 2. Server diagnose
    try {
      const r = await diagnose({ data: undefined as never });
      setServer(r);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
    }

    // 3. Probe /start with manual redirect
    try {
      const token = s.session?.access_token;
      const res = await fetch(startUrl, {
        method: "GET",
        redirect: "manual",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      let body: string | null = null;
      if (res.type !== "opaqueredirect" && res.status !== 0) {
        try { body = await res.text(); } catch { /* ignore */ }
      }
      setStartProbe({
        status: res.status,
        location: res.headers.get("location"),
        body: body && body.length > 600 ? body.slice(0, 600) + "…" : body,
      });
    } catch (e) {
      setStartProbe({ status: 0, location: null, body: null, error: e instanceof Error ? e.message : String(e) });
    }

    setRunning(false);
  }, [diagnose, startUrl]);

  useEffect(() => {
    runAll();
  }, [runAll]);

  // Listen for OAuth popup postMessage
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data as { type?: string; ok?: boolean; message?: string } | null;
      if (!data || data.type !== "gmail-oauth") return;
      setPopupLog((prev) => [
        { ts: new Date().toISOString(), ok: !!data.ok, message: data.message ?? "(sem mensagem)" },
        ...prev,
      ]);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const openOAuthPopup = () => {
    const w = window.open("/google-oauth-popup", "google-oauth-diag", "width=520,height=640");
    if (!w) toast.error("Popup bloqueado pelo navegador");
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  // Compute statuses
  const sessionStatus: Status = session?.hasToken ? "ok" : session ? "error" : "pending";
  const envStatus: Status = !server
    ? "pending"
    : server.env.GOOGLE_OAUTH_CLIENT_ID.present &&
      server.env.GOOGLE_OAUTH_CLIENT_SECRET.present &&
      server.env.GOOGLE_OAUTH_STATE_SECRET.present
    ? "ok"
    : "error";
  const stateStatus: Status = !server ? "pending" : server.stateSample ? "ok" : "error";
  const startStatus: Status = !startProbe
    ? "pending"
    : startProbe.status === 302 && startProbe.location?.includes("accounts.google.com")
    ? "ok"
    : startProbe.status === 0 || startProbe.error
    ? "error"
    : startProbe.status >= 400
    ? "error"
    : "warn";
  const tokensStatus: Status = !server ? "pending" : server.tokens.length > 0 ? "ok" : "warn";

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Diagnóstico Google OAuth</h1>
          <p className="text-muted-foreground">
            Verifica cada etapa do fluxo de conexão Gmail (start → Google → callback).
          </p>
        </div>
        <Button onClick={runAll} disabled={running} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
          Rodar novamente
        </Button>
      </div>

      <Section
        title="1. Sessão Supabase"
        status={sessionStatus}
        summary={session ? `${session.email ?? "(sem email)"} · access_token ${session.hasToken ? "ok" : "ausente"}` : "Carregando…"}
      >
        {session && <Pre data={session} />}
      </Section>

      <Section
        title="2. Variáveis de ambiente no servidor"
        status={envStatus}
        summary={serverError ?? (server ? "Secrets verificadas (sem expor valores)." : "Carregando…")}
      >
        {server && (
          <>
            <Pre data={server.env} />
            <p className="text-xs text-muted-foreground mt-2">
              Confirme que o <strong>Client ID</strong> acima (preview) corresponde ao OAuth Client que você cadastrou no
              Google Cloud Console.
            </p>
          </>
        )}
      </Section>

      <Section
        title="3. Redirect URI esperado"
        status="warn"
        summary="Este valor PRECISA estar cadastrado em 'Authorized redirect URIs' no Google Cloud Console (idêntico, incluindo https e barra final)."
      >
        <div className="flex gap-2">
          <Input readOnly value={redirectUri} className="font-mono text-xs" />
          <Button size="icon" variant="outline" onClick={() => copy(redirectUri)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Origin atual: <code>{origin}</code>. Se você usa preview E produção, ambos os redirect_uri devem estar
          cadastrados no Google.
        </p>
      </Section>

      <Section
        title="4. HMAC do parâmetro state"
        status={stateStatus}
        summary={server?.stateError ?? (server?.stateSample ? "Assinatura HMAC gerada com sucesso." : "Carregando…")}
      >
        {server?.stateSample && (
          <Pre data={`${server.stateSample.slice(0, 80)}…`} />
        )}
      </Section>

      <Section
        title="5. Probe do endpoint /api/public/google/oauth/start"
        status={startStatus}
        summary={
          !startProbe
            ? "Carregando…"
            : startProbe.error
            ? `Falha de rede: ${startProbe.error}`
            : `HTTP ${startProbe.status}${startProbe.location ? " → redirect para Google" : ""}`
        }
      >
        {startProbe && (
          <>
            <Pre data={startProbe} />
            {startProbe.status >= 400 && startProbe.body && (
              <p className="text-xs text-destructive mt-2">
                ⚠ Erro do servidor — confira o corpo acima. Provavelmente <code>GOOGLE_OAUTH_CLIENT_ID</code> ou{" "}
                <code>GOOGLE_OAUTH_STATE_SECRET</code> ausente.
              </p>
            )}
            {startProbe.status === 302 && startProbe.location && (
              <Badge variant="default" className="mt-2">
                OK — servidor está redirecionando para Google
              </Badge>
            )}
          </>
        )}
      </Section>

      <Section
        title="6. Fluxo usado pelo app"
        status="ok"
        summary="Os botões de conexão devem abrir primeiro a ponte /google-oauth-popup, não o endpoint direto /api/public/google/oauth/start."
      >
        <Pre data={{ popupBridgeUrl, directEndpointIsOnlyForServerStart: startUrl }} />
      </Section>

      <Section
        title="7. Tokens Gmail salvos para este usuário"
        status={tokensStatus}
        summary={
          server
            ? server.tokens.length === 0
              ? "Nenhuma conta Gmail conectada ainda."
              : `${server.tokens.length} conta(s) conectada(s).`
            : "Carregando…"
        }
      >
        {server && server.tokens.length > 0 && <Pre data={server.tokens} />}
        {server?.tokensError && <p className="text-xs text-destructive">{server.tokensError}</p>}
      </Section>

      <Section
        title="8. Auditoria de conexão (últimos 10 eventos)"
        status={server ? (server.audit.length > 0 ? "ok" : "warn") : "pending"}
        summary={
          server
            ? server.audit.length === 0
              ? "Nenhum evento registrado."
              : `${server.audit.length} evento(s).`
            : "Carregando…"
        }
      >
        {server && server.audit.length > 0 && <Pre data={server.audit} />}
        {server?.auditError && <p className="text-xs text-destructive">{server.auditError}</p>}
      </Section>

      <Card className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ExternalLink className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="font-medium">9. Testar OAuth em popup com log</div>
            <p className="text-sm text-muted-foreground">
              Abre o fluxo real pela ponte /google-oauth-popup e captura a mensagem do callback (sucesso ou erro completo).
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={openOAuthPopup}>Iniciar OAuth em popup</Button>
          {popupLog.length > 0 && (
            <Button variant="outline" onClick={() => setPopupLog([])}>
              Limpar log
            </Button>
          )}
        </div>
        {popupLog.length > 0 && (
          <div className="space-y-1">
            {popupLog.map((l, i) => (
              <div
                key={i}
                className={`text-xs p-2 rounded border ${
                  l.ok ? "border-green-600/30 bg-green-600/5" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="font-mono text-muted-foreground">{l.ts}</div>
                <div className="font-medium">{l.ok ? "✓ OK" : "✗ ERRO"}</div>
                <div className="whitespace-pre-wrap break-words">{l.message}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 bg-muted/40">
        <h3 className="font-semibold mb-2">Como interpretar</h3>
        <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
          <li>Se <strong>1</strong> falha: faça login novamente.</li>
          <li>Se <strong>2</strong> ou <strong>4</strong> falha: secret faltando no servidor (variáveis Google_OAUTH_*).</li>
          <li>Se <strong>5</strong> retorna HTTP 500: olhe o body — provável secret ausente ou token inválido.</li>
          <li>Se <strong>5</strong> retorna 302 mas o <strong>popup (9)</strong> falha: o erro está no callback do Google — copie a mensagem do log do popup; geralmente <code>redirect_uri_mismatch</code> (compare com seção <strong>3</strong>) ou refresh_token ausente (precisa revogar acesso em myaccount.google.com/permissions).</li>
        </ul>
      </Card>
    </div>
  );
}
