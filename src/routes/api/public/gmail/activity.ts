import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkAddonAuth, jsonResponse, unauthorized } from "./_shared.server";

const Body = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  type: z.enum(["email", "ligacao", "reuniao", "whatsapp", "outro"]).default("email"),
  subject: z.string().optional().nullable(),
  content: z.string().optional().nullable(), // can be a note or snippet
  occurred_at: z.string().optional().nullable(),
  gmail_message_id: z.string().optional().nullable(),
  gmail_thread_id: z.string().optional().nullable(),
  from_email: z.string().optional().nullable(),
});

export const Route = createFileRoute("/api/public/gmail/activity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkAddonAuth(request)) return unauthorized();
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
        const d = parsed.data;
        if (!d.customer_id && !d.lead_id) {
          return jsonResponse({ error: "customer_id or lead_id required" }, 400);
        }

        const { data, error } = await supabaseAdmin
          .from("interactions")
          .insert({
            customer_id: d.customer_id ?? null,
            lead_id: d.lead_id ?? null,
            type: d.type,
            subject: d.subject ?? null,
            content: d.content ?? null,
            occurred_at: d.occurred_at ?? new Date().toISOString(),
          })
          .select("id").single();
        if (error) return jsonResponse({ error: error.message }, 500);

        if (d.gmail_message_id) {
          await supabaseAdmin.from("email_message_links").insert({
            gmail_message_id: d.gmail_message_id,
            gmail_thread_id: d.gmail_thread_id ?? null,
            from_email: d.from_email ?? null,
            subject: d.subject ?? null,
            snippet: d.content ?? null,
            customer_id: d.customer_id ?? null,
            lead_id: d.lead_id ?? null,
            booking_id: d.booking_id ?? null,
          });
        }
        return jsonResponse({ id: data.id });
      },
    },
  },
});
