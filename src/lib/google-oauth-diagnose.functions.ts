import { createServerFn } from "@tanstack/react-start";
import { createHmac, randomUUID } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const diagnoseGoogleOauth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
    const stateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? "";

    // Test state HMAC generation
    let stateSample: string | null = null;
    let stateError: string | null = null;
    try {
      if (!stateSecret) throw new Error("GOOGLE_OAUTH_STATE_SECRET ausente");
      const issuedAt = Date.now();
      const nonce = randomUUID();
      const payload = `${userId}.${issuedAt}.${nonce}`;
      const sig = createHmac("sha256", stateSecret).update(payload).digest("hex");
      stateSample = `${payload}.${sig}`;
    } catch (e) {
      stateError = e instanceof Error ? e.message : String(e);
    }

    // Show preview of clientId (first/last chars) so user can confirm it matches Google Console
    const clientIdPreview = clientId
      ? `${clientId.slice(0, 12)}…${clientId.slice(-16)}`
      : null;

    // Existing Gmail tokens for this user
    const { data: tokens, error: tokensError } = await supabase
      .from("user_gmail_tokens")
      .select("email_address, expires_at, scope, created_at, updated_at")
      .eq("user_id", userId);

    // Recent audit entries
    const { data: audit, error: auditError } = await supabase
      .from("gmail_connection_audit")
      .select("event, reason, email_address, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      userId,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: { present: !!clientId, length: clientId.length, preview: clientIdPreview },
        GOOGLE_OAUTH_CLIENT_SECRET: { present: !!clientSecret, length: clientSecret.length },
        GOOGLE_OAUTH_STATE_SECRET: { present: !!stateSecret, length: stateSecret.length },
      },
      stateSample,
      stateError,
      tokens: tokens ?? [],
      tokensError: tokensError?.message ?? null,
      audit: audit ?? [],
      auditError: auditError?.message ?? null,
      timestamp: new Date().toISOString(),
    };
  });
