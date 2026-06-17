// OAuth callback: receives ?code&state from Google, exchanges code,
// saves tokens to email_accounts for the user encoded in `state`.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        if (errParam) return html(errorPage(`Google retornou erro: ${errParam}`));
        if (!code || !state) return html(errorPage("Parâmetros ausentes (code/state)."));

        try {
          const { verifyState, exchangeCode, buildRedirectUri } = await import(
            "@/lib/google-oauth.server"
          );
          const v = verifyState(state);
          if (!v) return html(errorPage("State inválido ou expirado. Tente novamente."));

          const origin = `${url.protocol}//${url.host}`;
          const redirectUri = buildRedirectUri(origin);
          const tokens = await exchangeCode(code, redirectUri);

          // Fetch the user's email address from Google.
          const profRes = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            { headers: { Authorization: `Bearer ${tokens.access_token}` } },
          );
          if (!profRes.ok) {
            const t = await profRes.text();
            throw new Error(`Falha ao obter perfil Gmail: ${profRes.status} ${t.slice(0, 200)}`);
          }
          const profile = (await profRes.json()) as { emailAddress: string };

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          // Upsert by (user_id, provider).
          const { error: upsertErr } = await supabaseAdmin
            .from("email_accounts")
            .upsert(
              {
                user_id: v.userId,
                provider: "gmail_oauth",
                email: profile.emailAddress,
                username: profile.emailAddress,
                smtp_host: "smtp.gmail.com",
                smtp_port: 465,
                smtp_secure: true,
                imap_host: "imap.gmail.com",
                imap_port: 993,
                imap_secure: true,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? null,
                token_expires_at: expiresAt,
                scope: tokens.scope,
              } as any,
              { onConflict: "user_id,provider" },
            );
          if (upsertErr) throw new Error(`Erro salvando conta: ${upsertErr.message}`);

          return html(successPage(profile.emailAddress));
        } catch (e: any) {
          return html(errorPage(e?.message ?? "Erro desconhecido"));
        }
      },
    },
  },
});

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function successPage(email: string): string {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Gmail conectado</title>
<body style="font-family:system-ui;padding:32px;text-align:center;background:#0f172a;color:#e2e8f0">
<h1 style="color:#10b981">✓ Gmail conectado</h1>
<p>Conta <strong>${escapeHtml(email)}</strong> conectada com sucesso.</p>
<p style="color:#94a3b8">Você já pode fechar esta janela.</p>
<script>
  try { window.opener && window.opener.postMessage({ type: 'gmail-connected', email: ${JSON.stringify(email)} }, '*'); } catch(e){}
  setTimeout(function(){ try { window.close(); } catch(e){} }, 1500);
</script>
</body></html>`;
}

function errorPage(msg: string): string {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Erro</title>
<body style="font-family:system-ui;padding:32px;text-align:center;background:#0f172a;color:#e2e8f0">
<h1 style="color:#ef4444">Não foi possível conectar</h1>
<p>${escapeHtml(msg)}</p>
<p style="color:#94a3b8">Feche esta janela e tente novamente.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}
