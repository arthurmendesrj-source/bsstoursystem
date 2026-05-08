import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkAddonAuth, jsonResponse, unauthorized } from "./_shared.server";

// "Deal" maps to a Booking in this CRM (the existing concept of a sold trip).
const Body = z.object({
  customer_id: z.string().uuid(),
  lead_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  value: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  gmail_message_id: z.string().optional().nullable(),
  gmail_thread_id: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  snippet: z.string().max(1000).optional().nullable(),
});

export const Route = createFileRoute("/api/public/gmail/deal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkAddonAuth(request)) return unauthorized();
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
        const d = parsed.data;

        const insertPayload: Record<string, unknown> = {
          customer_id: d.customer_id,
          notes: d.title,
        };
        if (d.lead_id) insertPayload.lead_id = d.lead_id;
        if (d.value != null) insertPayload.total_amount = d.value;
        if (d.currency) insertPayload.currency = d.currency;

        const { data: booking, error } = await supabaseAdmin
          .from("bookings").insert(insertPayload as never)
          .select("id").single();
        if (error || !booking) return jsonResponse({ error: error?.message ?? "insert failed" }, 500);
        const bookingRow = booking as { id: string };

        if (d.gmail_message_id) {
          await supabaseAdmin.from("email_message_links").insert({
            gmail_message_id: d.gmail_message_id,
            gmail_thread_id: d.gmail_thread_id ?? null,
            subject: d.subject ?? null,
            snippet: d.snippet ?? null,
            customer_id: d.customer_id,
            lead_id: d.lead_id ?? null,
            booking_id: bookingRow.id,
          });
        }
        return jsonResponse({ id: bookingRow.id });
      },
    },
  },
});
