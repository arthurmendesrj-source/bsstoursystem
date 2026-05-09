// Cron-driven Gmail mirror tick (replaces legacy logic).
// 1) If a wipe is queued/in progress for an owner → run ONE small batch.
// 2) Else if a full mirror is in progress → run one full-sync tick.
// 3) Else → run an incremental sync.
// All work is small and idempotent so it never times out.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIncrementalSync, runWipeBatch } from "@/server/gmail-mirror.server";

export const Route = createFileRoute("/api/public/gmail-poll")({
  server: {
    handlers: {
      GET: async () => new Response("gmail-poll ready"),
      POST: async () => {
        const results: Record<string, unknown> = {};
        try {
          const { data: states } = await supabaseAdmin
            .from("email_sync_state")
            .select("owner_email, wipe_status, full_sync_in_progress, last_incremental_sync_at, last_full_sync_at");
          const rows = (states ?? []) as Array<{
            owner_email: string; wipe_status: string | null;
            full_sync_in_progress: boolean | null; last_incremental_sync_at: string | null;
            last_full_sync_at: string | null;
          }>;
          for (const r of rows) {
            const owner = r.owner_email;
            try {
              if (r.wipe_status === "wiping") {
                results[owner] = { type: "wipe", ...(await runWipeBatch(supabaseAdmin as any, owner)) };
              } else {
                // Apenas sincronização incremental (leve). Sem mirror histórico.
                const idleMs = r.last_incremental_sync_at
                  ? Date.now() - new Date(r.last_incremental_sync_at).getTime() : Infinity;
                if (idleMs > 60_000) {
                  results[owner] = { type: "inc", ...(await runIncrementalSync(supabaseAdmin as any, owner)) };
                } else {
                  results[owner] = { type: "skip" };
                }
              }
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
