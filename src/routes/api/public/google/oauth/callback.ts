// Google OAuth callback. Validates HMAC state, exchanges the code for tokens,
// fetches the user's Google email, persists tokens in user_gmail_tokens
// and links the email to the user in user_email_accounts.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_TTL_MS = 10 * 60 * 1000;

function verifyState(state: string): { userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, issuedAtStr, nonce, sig] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!issuedAt || Date.now() - issuedAt > STATE_TTL_MS) return null;
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(`${userId}.${issuedAtStr}.${nonce}`).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId };
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function popupClose(message: string, ok: boolean) {
  const safe = message.replace(/</g, "&lt;");
  return htmlResponse(`<!doctype html><html><head><meta charset="utf-8"><title>${ok ? "Conectado" : "Erro"}</title></head><body style="font-family:system-ui;padding:24px;text-align:center"><h2>${ok ? "Conta conectada" : "Falha ao conectar"}</h2><p>${safe}</p><p><button onclick="window.close()">Fechar</button></p><script>try{window.opener&&window.opener.postMessage({type:'gmail-oauth',ok:${ok ? "true" : "false"},message:${JSON.stringify(message)}},'*');}catch(e){}setTimeout(function(){window.close();},800);</script></body></html>`, ok ? 200 : 400);
}

export const Route = createFileRoute("/api/public/google/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) return popupClose(`Google retornou erro: ${errorParam}`, false);
        if (!code || !state) return popupClose("Parâmetros inválidos", false);

        const verified = verifyState(state);
        if (!verified) return popupClose("State inválido ou expirado", false);
        const userId = verified.userId;

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return popupClose("Credenciais Google não configuradas", false);
        }

        const redirectUri = `${url.origin}/api/public/google/oauth/callback`;

        // Exchange code for tokens
        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }).toString(),
        });
        const tokenText = await tokenRes.text();
        let tokenJson: any = null;
        try { tokenJson = tokenText ? JSON.parse(tokenText) : null; } catch { /* ignore */ }
        if (!tokenRes.ok || !tokenJson) {
          return popupClose(`Token exchange falhou (${tokenRes.status}): ${tokenText}`, false);
        }
        const accessToken = tokenJson.access_token as string;
        const refreshToken = tokenJson.refresh_token as string | undefined;
        const expiresIn = Number(tokenJson.expires_in ?? 3600);
        const scope = (tokenJson.scope as string | undefined) ?? null;

        if (!refreshToken) {
          return popupClose(
            "Google não retornou refresh_token. Vá em https://myaccount.google.com/permissions, remova o acesso ao app e tente conectar novamente.",
            false,
          );
        }

        // Get user email
        const uinfoRes = await fetch(USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const uinfo = (await uinfoRes.json()) as { email?: string; email_verified?: boolean };
        if (!uinfoRes.ok || !uinfo.email) {
          return popupClose("Não foi possível obter o email da conta Google", false);
        }
        const emailAddress = uinfo.email.toLowerCase();
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // Enforce 1 user = 1 Gmail and 1 Gmail = 1 user.
        const { data: userTokens } = await supabaseAdmin
          .from("user_gmail_tokens")
          .select("id, user_id, email_address")
          .or(`user_id.eq.${userId},email_address.eq.${emailAddress}`);
        const rows = (userTokens ?? []) as Array<{ id: string; user_id: string; email_address: string }>;
        const otherEmailForThisUser = rows.find((r) => r.user_id === userId && r.email_address !== emailAddress);
        if (otherEmailForThisUser) {
          await supabaseAdmin.from("gmail_connection_audit").insert({
            user_id: userId, email_address: emailAddress,
            event: "refresh_failed", reason: `Usuário já possui ${otherEmailForThisUser.email_address} conectada`,
            metadata: { conflict: "user_has_other_account" },
          });
          return popupClose(
            `Este usuário já tem a conta ${otherEmailForThisUser.email_address} conectada. Desconecte-a em Configurações antes de conectar ${emailAddress}.`,
            false,
          );
        }
        const sameEmailOtherUser = rows.find((r) => r.email_address === emailAddress && r.user_id !== userId);
        if (sameEmailOtherUser) {
          await supabaseAdmin.from("gmail_connection_audit").insert({
            user_id: userId, email_address: emailAddress,
            event: "refresh_failed", reason: "Conta Gmail já está conectada em outro usuário",
            metadata: { conflict: "email_in_other_user", other_user_id: sameEmailOtherUser.user_id },
          });
          return popupClose(
            `A conta ${emailAddress} já está conectada por outro usuário do sistema. Cada caixa Gmail pode pertencer a apenas um usuário.`,
            false,
          );
        }
        const prior = rows.find((r) => r.user_id === userId && r.email_address === emailAddress) ?? null;

        // Upsert tokens
        const { error: upErr } = await supabaseAdmin
          .from("user_gmail_tokens")
          .upsert({
            user_id: userId,
            email_address: emailAddress,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            scope,
          }, { onConflict: "user_id" });
        if (upErr) return popupClose(`Erro ao salvar tokens: ${upErr.message}`, false);

        await supabaseAdmin.from("gmail_connection_audit").insert({
          user_id: userId,
          email_address: emailAddress,
          event: prior ? "reconnected" : "connected",
          actor_id: userId,
          metadata: { scope },
        });

        // Link email to user (best-effort; ignore unique violation)
        const { data: anyAcc } = await supabaseAdmin
          .from("user_email_accounts")
          .select("id")
          .eq("user_id", userId)
          .limit(1);
        const isFirst = !anyAcc || anyAcc.length === 0;
        await supabaseAdmin.from("user_email_accounts").upsert({
          user_id: userId,
          email_address: emailAddress,
          is_primary: isFirst,
        }, { onConflict: "user_id,email_address" });

        // Seed sync state historyId so incremental sync can start fresh
        try {
          const profRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const prof = (await profRes.json()) as { historyId?: string };
          if (prof?.historyId) {
            await supabaseAdmin.from("email_sync_state").upsert({
              owner_email: emailAddress,
              last_history_id: Number(prof.historyId),
              last_incremental_sync_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "owner_email" });
          }
        } catch (e) {
          console.error("seed history id failed", e);
        }

        return popupClose(`Conta ${emailAddress} conectada com sucesso!`, true);
      },
    },
  },
});
