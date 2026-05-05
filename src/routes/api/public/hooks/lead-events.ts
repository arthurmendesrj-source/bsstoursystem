import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser, sendPushToLeadRecipients } from "@/server/push.server";

const Schema = z.object({
  event: z.enum(["lead_assigned", "lead_status_changed"]),
  leadId: z.string().uuid(),
  leadName: z.string().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  oldStatus: z.string().optional().nullable(),
  newStatus: z.string().optional().nullable(),
  actorId: z.string().uuid().optional().nullable(),
});

function checkApiKey(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const got = request.headers.get("apikey") || request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return !!expected && !!got && got === expected;
}

export const Route = createFileRoute("/api/public/hooks/lead-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkApiKey(request)) {
          return new Response("unauthorized", { status: 401 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const data = parsed.data;
        const exclude = data.actorId ? [data.actorId] : [];

        // Janela de dedup: ignora eventos repetidos para o mesmo destino dentro deste intervalo
        const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
        const nowIso = new Date().toISOString();

        try {
          // Carrega marcadores de dedup do lead
          const { data: leadRow } = await supabaseAdmin
            .from("leads")
            .select(
              "last_assigned_notified_at, last_assigned_notified_to, last_status_notified_at, last_status_notified_value",
            )
            .eq("id", data.leadId)
            .maybeSingle();

          if (data.event === "lead_assigned" && data.assignedTo) {
            if (exclude.includes(data.assignedTo)) {
              return Response.json({ ok: true, skipped: "self-assign" });
            }
            // Dedup: mesmo destinatário notificado dentro da janela
            if (
              leadRow?.last_assigned_notified_to === data.assignedTo &&
              leadRow?.last_assigned_notified_at &&
              Date.now() - new Date(leadRow.last_assigned_notified_at).getTime() < DEDUP_WINDOW_MS
            ) {
              return Response.json({ ok: true, skipped: "duplicate-assignment" });
            }
            const r = await sendPushToUser({
              userId: data.assignedTo,
              title: "Novo lead atribuído a você",
              body: data.leadName ? `Lead: ${data.leadName}` : undefined,
              url: `/leads/${data.leadId}`,
              leadId: data.leadId,
              tag: `lead-assigned-${data.leadId}`,
              eventType: "lead_assigned",
            });
            await supabaseAdmin
              .from("leads")
              .update({
                last_assigned_notified_at: nowIso,
                last_assigned_notified_to: data.assignedTo,
              })
              .eq("id", data.leadId);
            return Response.json({ ok: true, result: r });
          }
          if (data.event === "lead_status_changed") {
            // Dedup: mesmo status final notificado dentro da janela
            if (
              data.newStatus &&
              leadRow?.last_status_notified_value === data.newStatus &&
              leadRow?.last_status_notified_at &&
              Date.now() - new Date(leadRow.last_status_notified_at).getTime() < DEDUP_WINDOW_MS
            ) {
              return Response.json({ ok: true, skipped: "duplicate-status" });
            }
            const r = await sendPushToLeadRecipients({
              leadId: data.leadId,
              title: "Status do lead alterado",
              body: `${data.leadName ?? "Lead"}: ${data.oldStatus ?? "?"} → ${data.newStatus ?? "?"}`,
              url: `/leads/${data.leadId}`,
              tag: `lead-status-${data.leadId}`,
              eventType: "lead_status_changed",
              excludeUserIds: exclude,
            });
            if (data.newStatus) {
              await supabaseAdmin
                .from("leads")
                .update({
                  last_status_notified_at: nowIso,
                  last_status_notified_value: data.newStatus as never,
                })
                .eq("id", data.leadId);
            }
            return Response.json({ ok: true, result: r });
          }
          return Response.json({ ok: true, skipped: "no-op" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

void supabaseAdmin;
