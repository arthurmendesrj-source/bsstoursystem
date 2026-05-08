// Cron-driven Gmail mirror tick. Called every minute by pg_cron.
// Drains the full sync queue for any owner with full_sync_in_progress=true,
// and runs incremental sync for owners idle for >5 min.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runFullSyncTick, runIncrementalSync } from "@/server/gmail-mirror.server";

export const Route = createFileRoute("/api/public/gmail-cron-tick")({
  server: {
    handlers: {
      POST: async () => {
        const results: Array<Record<string, unknown>> = [];
        try {
          // 1) Drive full sync for any in-progress owner (one tick each)
          const { data: inProg } = await supabaseAdmin
            .from("email_sync_state")
            .select("owner_email")
            .eq("full_sync_in_progress", true);
          for (const row of (inProg ?? []) as Array<{ owner_email: string }>) {
            try {
              const r = await runFullSyncTick(supabaseAdmin as any, row.owner_email);
              results.push({ owner: row.owner_email, type: "full", ...r });
            } catch (e) {
              console.error("full tick fail", row.owner_email, e);
              results.push({ owner: row.owner_email, type: "full", error: e instanceof Error ? e.message : String(e) });
            }
          }

          // 2) Incremental sync for any owner idle > 5 min and NOT in full sync
          const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
          const { data: idle } = await supabaseAdmin
            .from("email_sync_state")
            .select("owner_email,last_incremental_sync_at")
            .eq("full_sync_in_progress", false)
            .or(`last_incremental_sync_at.is.null,last_incremental_sync_at.lt.${fiveMinAgo}`);
          for (const row of (idle ?? []) as Array<{ owner_email: string }>) {
            try {
              const r = await runIncrementalSync(supabaseAdmin as any, row.owner_email);
              results.push({ owner: row.owner_email, type: "inc", ...r });
            } catch (e) {
              console.error("inc tick fail", row.owner_email, e);
              results.push({ owner: row.owner_email, type: "inc", error: e instanceof Error ? e.message : String(e) });
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
