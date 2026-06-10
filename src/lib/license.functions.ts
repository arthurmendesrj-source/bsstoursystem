import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RedeemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Informe o código")
    .max(32, "Código muito longo")
    .regex(/^[A-Za-z0-9_-]+$/, "Código inválido"),
});

export const redeemLicenseCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RedeemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Find an active tenant where the user is owner
    const { data: membership, error: mErr } = await supabase
      .from("tenant_members")
      .select("tenant_id, role_in_tenant")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!membership?.tenant_id) {
      throw new Error("Você precisa ter uma empresa antes de ativar uma licença.");
    }
    if (membership.role_in_tenant !== "owner") {
      throw new Error("Apenas o dono da empresa pode ativar uma licença.");
    }
    const tenantId = membership.tenant_id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load + validate license atomically-ish: re-check uses_count on update.
    const codeNorm = data.code.toUpperCase();
    const { data: license, error: lErr } = await supabaseAdmin
      .from("license_codes")
      .select("*")
      .ilike("code", codeNorm)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!license || !license.is_active) {
      throw new Error("Código inválido ou inativo.");
    }
    if (license.uses_count >= license.max_uses) {
      throw new Error("Este código já foi utilizado.");
    }

    // Find plan
    const { data: plan, error: pErr } = await supabaseAdmin
      .from("plans")
      .select("id, name")
      .eq("code", license.plan_code)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plan) throw new Error("Plano da licença não encontrado.");

    // Reserve the redemption with a conditional update (race-safe).
    const now = new Date();
    const expiresAt = new Date(now.getTime() + license.duration_days * 86400000);
    const nextUses = license.uses_count + 1;
    const { data: claimed, error: cErr } = await supabaseAdmin
      .from("license_codes")
      .update({
        uses_count: nextUses,
        is_active: nextUses < license.max_uses,
        redeemed_by_tenant_id: tenantId,
        redeemed_by_user_id: userId,
        redeemed_at: now.toISOString(),
      })
      .eq("id", license.id)
      .eq("uses_count", license.uses_count)
      .select("id")
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!claimed) throw new Error("Este código já foi utilizado.");

    // Upsert subscription as active for the duration.
    const { error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          tenant_id: tenantId,
          plan_id: plan.id,
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: expiresAt.toISOString(),
          trial_end: null,
          grace_until: null,
          cancel_at_period_end: false,
          canceled_at: null,
        },
        { onConflict: "tenant_id" },
      );
    if (sErr) throw new Error(sErr.message);

    return {
      ok: true as const,
      plan_name: plan.name,
      expires_at: expiresAt.toISOString(),
    };
  });
