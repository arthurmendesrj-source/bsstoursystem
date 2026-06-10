// Popup-bridge: opens at our origin (top-level navigation in the popup window),
// fetches the Google authorization URL from /api/public/google/oauth/start?mode=json,
// then redirects the popup window to accounts.google.com. This avoids loading
// the Google consent page inside the editor preview iframe (ERR_BLOCKED_BY_RESPONSE).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/google-oauth-popup")({
  component: GoogleOAuthPopup,
});

function postResult(ok: boolean, message: string) {
  try {
    if (window.opener) {
      window.opener.postMessage({ type: "gmail-oauth", ok, message }, "*");
    }
  } catch {
    /* ignore */
  }
}

function GoogleOAuthPopup() {
  const [status, setStatus] = useState<string>("Preparando conexão com o Google…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus("Verificando sessão…");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setError("Sessão expirada. Faça login novamente no app e tente outra vez.");
          postResult(false, "Sessão expirada — faça login novamente.");
          return;
        }

        setStatus("Solicitando URL de autorização do Google…");
        const res = await fetch(`/api/public/google/oauth/start?mode=json`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let json: { ok?: boolean; authorizationUrl?: string; error?: string } | null = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

        if (!res.ok || !json?.ok || !json.authorizationUrl) {
          const msg = json?.error || `HTTP ${res.status}: ${text.slice(0, 200)}`;
          setError(`Falha ao iniciar OAuth: ${msg}`);
          postResult(false, `Falha ao iniciar OAuth: ${msg}`);
          return;
        }

        if (cancelled) return;
        setStatus("Redirecionando para o Google…");
        // Top-level navigation inside the popup window. Google consent page
        // is NOT iframed, so X-Frame-Options does not block it.
        window.location.replace(json.authorizationUrl);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Erro inesperado: ${msg}`);
        postResult(false, `Erro inesperado: ${msg}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, textAlign: "center" }}>
      <h2 style={{ marginBottom: 12 }}>Conectando ao Google</h2>
      {error ? (
        <>
          <p style={{ color: "#b91c1c" }}>{error}</p>
          <p>
            <button onClick={() => window.close()}>Fechar</button>
          </p>
        </>
      ) : (
        <p style={{ color: "#475569" }}>{status}</p>
      )}
    </div>
  );
}
