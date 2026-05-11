// Middleware for selecting the active Gmail account on a server fn call.
// Lives in a non-".server" file because it is referenced at the TOP LEVEL of
// `.functions.ts` files (`.middleware([requireGmailAccount])`), which is
// reachable from the client bundle. The body only runs server-side, and we
// dynamically import server-only helpers inside it to keep the import graph
// clean for the client bundle.
import { createMiddleware } from "@tanstack/react-start";

export const requireGmailAccount = createMiddleware({ type: "function" }).server(
  async ({ next, data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runWithGmailAccount } = await import("@/server/gmail-auth.server");

    const ctx = (context ?? {}) as unknown as { userId?: string };
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
