import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns whether the tenant's access should be blocked because of unpaid
 * subscription, plus a human-readable reason and grace info for the UI.
 */
export const getBillingAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: sub }, { data: blocked }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("status, grace_until, current_period_end")
        .eq("tenant_id", data.tenant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("is_tenant_billing_blocked", { _tenant_id: data.tenant_id }),
    ]);

    return {
      blocked: !!blocked,
      status: sub?.status ?? null,
      grace_until: sub?.grace_until ?? null,
      current_period_end: sub?.current_period_end ?? null,
    };
  });
