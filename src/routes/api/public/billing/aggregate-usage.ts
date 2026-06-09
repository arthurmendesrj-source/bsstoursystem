import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint — aggregates storage usage per tenant per bucket.
 * Triggered daily by pg_cron with apikey header.
 *
 * Convention: storage objects are placed under `<tenant_id>/...`. We sum the
 * `metadata->>size` of every object whose first path segment is a tenant id.
 */
export const Route = createFileRoute("/api/public/billing/aggregate-usage")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Pull all objects (capped) and aggregate in memory.
        // Storage schema isn't in the generated types — cast to any.
        const { data: objects, error } = await (supabaseAdmin as any)
          .schema("storage")
          .from("objects")
          .select("bucket_id, name, metadata")
          .limit(50_000);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const today = new Date().toISOString().slice(0, 10);
        const agg = new Map<string, { bytes: number; files: number }>();

        for (const obj of (objects ?? []) as Array<{ bucket_id: string; name: string; metadata: any }>) {
          const firstSeg = String(obj.name ?? "").split("/")[0];
          if (!firstSeg || firstSeg.length < 32) continue; // not uuid
          const size = Number(obj.metadata?.size ?? 0);
          const key = `${firstSeg}::${obj.bucket_id}`;
          const cur = agg.get(key) ?? { bytes: 0, files: 0 };
          cur.bytes += size;
          cur.files += 1;
          agg.set(key, cur);
        }

        const rows = Array.from(agg.entries()).map(([k, v]) => {
          const [tenant_id, bucket] = k.split("::");
          return {
            tenant_id,
            bucket,
            bytes: v.bytes,
            file_count: v.files,
            snapshot_date: today,
          };
        });

        if (rows.length) {
          await supabaseAdmin
            .from("usage_storage_daily")
            .upsert(rows, { onConflict: "tenant_id,bucket,snapshot_date" });
        }

        return Response.json({ ok: true, rows: rows.length });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});
