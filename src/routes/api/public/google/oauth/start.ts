// Initiates Google OAuth flow for the currently logged-in user.
// Requires Authorization: Bearer <supabase_access_token> header from the SPA.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function signState(payload: string): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_STATE_SECRET is not configured");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export const Route = createFileRoute("/api/public/google/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const accessToken =
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          url.searchParams.get("token") ?? "";

        if (!accessToken) {
          return new Response("Missing user access token", { status: 401 });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data, error } = await supabase.auth.getClaims(accessToken);
        if (error || !data?.claims?.sub) {
          return new Response("Invalid user token", { status: 401 });
        }
        const userId = data.claims.sub as string;

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) {
          return new Response("GOOGLE_OAUTH_CLIENT_ID is not configured", { status: 500 });
        }

        const redirectUri = `${url.origin}/api/public/google/oauth/callback`;
        const issuedAt = Date.now();
        const nonce = crypto.randomUUID();
        const payload = `${userId}.${issuedAt}.${nonce}`;
        const sig = signState(payload);
        const state = `${payload}.${sig}`;

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state,
        });

        throw redirect({ href: `${GOOGLE_AUTH_URL}?${params.toString()}` });
      },
    },
  },
});
