/**
 * AI usage meter. Call after every successful Lovable AI invocation.
 * Server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AiFeature = "chat" | "itinerary" | "email" | "image" | "assistant" | "other";

const COST_PER_1K = {
  // BRL-cents per 1K tokens (approx; tune per model).
  // We store credits as "tokens consumed"; the wallet bills tokens directly.
  default: 1,
} as const;

export async function logAiUsage(input: {
  tenant_id: string;
  user_id?: string | null;
  feature: AiFeature;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  metadata?: Record<string, unknown>;
}) {
  if (!input.tenant_id) return;
  const total = (input.prompt_tokens || 0) + (input.completion_tokens || 0);
  const credits = total; // 1 token = 1 credit

  // Insert event (best-effort, never block caller on failure).
  try {
    await supabaseAdmin.from("usage_ai_events").insert({
      tenant_id: input.tenant_id,
      user_id: input.user_id ?? null,
      feature: input.feature,
      model: input.model,
      prompt_tokens: input.prompt_tokens,
      completion_tokens: input.completion_tokens,
      credits_charged: credits,
      metadata: (input.metadata ?? {}) as any,
    } as any);

    // Debit wallet via ledger (consume).
    const { data: wallet } = await supabaseAdmin
      .from("billing_credit_wallet")
      .select("ai_credits")
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    const current = Number(wallet?.ai_credits ?? 0);
    const next = current - credits;

    await supabaseAdmin
      .from("billing_credit_wallet")
      .upsert({
        tenant_id: input.tenant_id,
        ai_credits: next,
        updated_at: new Date().toISOString(),
      });

    await supabaseAdmin.from("billing_credit_ledger").insert({
      tenant_id: input.tenant_id,
      kind: "consume",
      resource: "ai_credits",
      amount: -credits,
      balance_after: next,
      reference_type: "ai_usage",
      note: `${input.feature}/${input.model}`,
    });
  } catch (err) {
    console.error("[ai-meter] failed", err);
  }
}

export { COST_PER_1K };
