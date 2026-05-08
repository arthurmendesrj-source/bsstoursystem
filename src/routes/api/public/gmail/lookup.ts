import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkAddonAuth, jsonResponse, unauthorized } from "./_shared.server";

export const Route = createFileRoute("/api/public/gmail/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!checkAddonAuth(request)) return unauthorized();
        const url = new URL(request.url);
        const email = url.searchParams.get("email")?.trim().toLowerCase();
        if (!email) return jsonResponse({ error: "email required" }, 400);

        const [{ data: customer }, { data: lead }] = await Promise.all([
          supabaseAdmin
            .from("customers")
            .select("id, full_name, email, phone, code")
            .ilike("email", email)
            .maybeSingle(),
          supabaseAdmin
            .from("leads")
            .select("id, name, email, status, code, customer_id")
            .ilike("email", email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        let bookings: Array<{ id: string; status: string | null }> = [];
        if (customer?.id) {
          const { data } = await supabaseAdmin
            .from("bookings")
            .select("id, status")
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false })
            .limit(5);
          bookings = (data ?? []) as Array<{ id: string; status: string | null }>;
        }
        return jsonResponse({ contact: customer ?? null, lead: lead ?? null, deals: bookings });
      },
    },
  },
});
