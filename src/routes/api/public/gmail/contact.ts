import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkAddonAuth, jsonResponse, unauthorized } from "./_shared.server";

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  gmail_message_id: z.string().optional().nullable(),
  gmail_thread_id: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  snippet: z.string().max(1000).optional().nullable(),
});

export const Route = createFileRoute("/api/public/gmail/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkAddonAuth(request)) return unauthorized();
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
        const d = parsed.data;

        const { data: existing } = await supabaseAdmin
          .from("customers").select("id").ilike("email", d.email).maybeSingle();

        let customerId = existing?.id;
        if (!customerId) {
          const { data, error } = await supabaseAdmin
            .from("customers")
            .insert({ full_name: d.name, email: d.email, phone: d.phone ?? null, type: "pf" })
            .select("id").single();
          if (error) return jsonResponse({ error: error.message }, 500);
          customerId = data.id;
        }

        if (d.gmail_message_id) {
          await supabaseAdmin.from("email_message_links").insert({
            gmail_message_id: d.gmail_message_id,
            gmail_thread_id: d.gmail_thread_id ?? null,
            from_email: d.email,
            subject: d.subject ?? null,
            snippet: d.snippet ?? null,
            customer_id: customerId,
          });
        }
        return jsonResponse({ id: customerId });
      },
    },
  },
});
