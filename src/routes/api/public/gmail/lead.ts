import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkAddonAuth, jsonResponse, unauthorized } from "./_shared.server";

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  snippet: z.string().max(1000).optional().nullable(),
  gmail_message_id: z.string().optional().nullable(),
  gmail_thread_id: z.string().optional().nullable(),
});

export const Route = createFileRoute("/api/public/gmail/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkAddonAuth(request)) return unauthorized();
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
        const d = parsed.data;

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            name: d.name,
            email: d.email,
            phone: d.phone ?? null,
            source: "gmail_addon",
            notes: d.snippet ?? null,
          })
          .select("id, code").single();
        if (error) return jsonResponse({ error: error.message }, 500);

        if (d.gmail_message_id) {
          await supabaseAdmin.from("email_message_links").insert({
            gmail_message_id: d.gmail_message_id,
            gmail_thread_id: d.gmail_thread_id ?? null,
            from_email: d.email,
            subject: d.subject ?? null,
            snippet: d.snippet ?? null,
            lead_id: lead.id,
          });
        }
        return jsonResponse({ id: lead.id, code: lead.code });
      },
    },
  },
});
