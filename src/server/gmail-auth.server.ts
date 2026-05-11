// Per-user Gmail OAuth token store + helper to call Gmail API directly
// (replacing the workspace-level Lovable connector gateway).
//
// Usage:
//   await runWithGmailAccount({ userId, emailAddress }, async () => {
//     const profile = await gmailFetch("/users/me/profile");
//   });
//
// Or rely on the `requireGmailAccount` middleware below in createServerFn
// chains — it picks the email from input.emailAddress (preferred) or the
// user's primary connected account, refreshes the access token, then runs
// the handler inside the AsyncLocalStorage scope.
import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GmailAccountCtx = { userId: string; emailAddress: string };

const als = new AsyncLocalStorage<GmailAccountCtx>();

export function runWithGmailAccount<T>(ctx: GmailAccountCtx, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

export function getGmailAccount(): GmailAccountCtx {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error(
      "Nenhuma conta Gmail ativa. Conecte sua conta Google em E-mail antes de continuar.",
    );
  }
  return ctx;
}

export function tryGetGmailAccount(): GmailAccountCtx | undefined {
  return als.getStore();
}

// ---------------- Token management ----------------

type TokenRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
};

async function loadTokenRow(userId: string, emailAddress: string): Promise<TokenRow> {
  const { data, error } = await supabaseAdmin
    .from("user_gmail_tokens")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", userId)
    .eq("email_address", emailAddress.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`tokens lookup: ${error.message}`);
  if (!data) {
    throw new Error(
      `Conta Gmail ${emailAddress} não está conectada para este usuário.`,
    );
  }
  return data as TokenRow;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID/SECRET não configurados");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    throw new Error(`google refresh ${res.status}: ${text}`);
  }
  return {
    access_token: json.access_token as string,
    expires_in: Number(json.expires_in ?? 3600),
    scope: (json.scope as string | undefined) ?? null,
  };
}

async function getValidAccessToken(userId: string, emailAddress: string): Promise<string> {
  const row = await loadTokenRow(userId, emailAddress);
  const expiresAt = new Date(row.expires_at).getTime();
  // Refresh 60s before expiry
  if (Date.now() < expiresAt - 60_000) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("user_gmail_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
      scope: refreshed.scope ?? row.scope,
    })
    .eq("user_id", userId)
    .eq("email_address", emailAddress.toLowerCase());
  if (error) console.error("token update failed", error.message);
  return refreshed.access_token;
}

// ---------------- gmailFetch (replaces gw) ----------------

export async function gmailFetch(path: string, init?: RequestInit): Promise<any> {
  const { userId, emailAddress } = getGmailAccount();
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let token: string;
    try {
      token = await getValidAccessToken(userId, emailAddress);
    } catch (e) {
      throw e;
    }
    let res: Response;
    try {
      res = await fetch(`${GMAIL_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init?.headers as Record<string, string> | undefined),
        },
      });
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw e;
    }
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (res.ok) return data as any;

    // 401 → token may have just expired; force refresh once and retry
    if (res.status === 401 && attempt === 1) {
      // Force re-fetch on next loop by zeroing expires_at
      await supabaseAdmin
        .from("user_gmail_tokens")
        .update({ expires_at: new Date(0).toISOString() })
        .eq("user_id", userId)
        .eq("email_address", emailAddress.toLowerCase());
      continue;
    }

    if ((res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      lastErr = new Error(`Gmail API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
      continue;
    }
    throw new Error(`Gmail API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gmail API: unknown error");
}

// ---------------- Middleware ----------------
// Picks the Gmail account for a request and runs the handler inside ALS.
// Must run AFTER requireSupabaseAuth (which sets context.userId).
//
// Selection rule:
//   1. If input data has `emailAddress`, use that (must belong to the user).
//   2. Otherwise pick the user's first connected Gmail account
//      (ordered by created_at).
//   3. If the user has no connected Gmail account, throw a friendly error.

export const requireGmailAccount = createMiddleware({ type: "function" }).server(
  async ({ next, data, context }) => {
    const ctx = context as { userId?: string };
    const userId = ctx.userId;
    if (!userId) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const requested = (data as { emailAddress?: string } | undefined)?.emailAddress;
    let emailAddress: string | null = requested ? requested.toLowerCase() : null;

    if (emailAddress) {
      const { data: row } = await supabaseAdmin
        .from("user_gmail_tokens")
        .select("email_address")
        .eq("user_id", userId)
        .eq("email_address", emailAddress)
        .maybeSingle();
      if (!row) {
        throw new Response(
          `Conta Gmail ${emailAddress} não conectada para este usuário`,
          { status: 400 },
        );
      }
    } else {
      const { data: row } = await supabaseAdmin
        .from("user_gmail_tokens")
        .select("email_address")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!row) {
        throw new Response(
          "Nenhuma conta Gmail conectada. Conecte sua conta Google na tela de E-mail.",
          { status: 400 },
        );
      }
      emailAddress = (row as { email_address: string }).email_address;
    }

    return runWithGmailAccount({ userId, emailAddress: emailAddress! }, () =>
      next({ context: { gmailAccount: { userId, emailAddress: emailAddress! } } }),
    );
  },
);
