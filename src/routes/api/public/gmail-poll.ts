// Cron-driven Gmail mirror tick — iterates over every connected Gmail
// account in `user_gmail_tokens` and runs an incremental sync inside the
// per-user OAuth context.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIncrementalSync, runWipeBatch } from "@/server/gmail-mirror.server";
import { runWithGmailAccount } from "@/server/gmail-auth.server";

export const Route = createFileRoute("/api/public/gmail-poll")({
  server: {
    handlers: {
      GET: async () => new Response("gmail-poll ready"),
      POST: async () => {
        const results: Record<string, unknown> = {};
        try {
          const { data: tokenRows } = await supabaseAdmin
            .from("user_gmail_tokens")
            .select("user_id, email_address");
          const tokens = (tokenRows ?? []) as Array<{ user_id: string; email_address: string }>;
          for (const t of tokens) {
            const owner = t.email_address.toLowerCase();
            try {
              const { data: state } = await supabaseAdmin
                .from("email_sync_state")
                .select("wipe_status, last_incremental_sync_at")
                .eq("owner_email", owner)
                .maybeSingle();
              const wipe = (state as { wipe_status?: string | null } | null)?.wipe_status ?? null;
              const lastInc = (state as { last_incremental_sync_at?: string | null } | null)?.last_incremental_sync_at ?? null;

              await runWithGmailAccount({ userId: t.user_id, emailAddress: owner }, async () => {
                if (wipe === "wiping") {
                  results[owner] = { type: "wipe", ...(await runWipeBatch(supabaseAdmin as any, owner)) };
                  return;
                }
                const idleMs = lastInc ? Date.now() - new Date(lastInc).getTime() : Infinity;
                if (idleMs > 60_000) {
                  results[owner] = { type: "inc", ...(await runIncrementalSync(supabaseAdmin as any, owner)) };
                } else {
                  results[owner] = { type: "skip" };
                }
              });
            } catch (e) {
              results[owner] = { error: e instanceof Error ? e.message : String(e) };
            }
          }
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: true, results }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
