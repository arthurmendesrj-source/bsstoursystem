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

        try {
          if (data.event === "lead_assigned" && data.assignedTo) {
            if (exclude.includes(data.assignedTo)) {
              return Response.json({ ok: true, skipped: "self-assign" });
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
            return Response.json({ ok: true, result: r });
          }
          if (data.event === "lead_status_changed") {
            const r = await sendPushToLeadRecipients({
              leadId: data.leadId,
              title: "Status do lead alterado",
              body: `${data.leadName ?? "Lead"}: ${data.oldStatus ?? "?"} → ${data.newStatus ?? "?"}`,
              url: `/leads/${data.leadId}`,
              tag: `lead-status-${data.leadId}`,
              eventType: "lead_status_changed",
              excludeUserIds: exclude,
            });
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
