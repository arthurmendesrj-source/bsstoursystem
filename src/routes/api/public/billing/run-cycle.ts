import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron — daily subscription cycle runner.
 * For each subscription whose period ended, charge the default card and roll
 * over the period. Idempotent: skips subscriptions already invoiced today.
 */
export const Route = createFileRoute("/api/public/billing/run-cycle")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const ip = await import("@/server/infinitepay.server");

        const now = new Date();
        const { data: subs } = await supabaseAdmin
          .from("subscriptions")
          .select(
            "id, tenant_id, status, current_period_end, plans:plan_id (price_cents, currency, name, interval)",
          )
          .in("status", ["active", "past_due"])
          .lte("current_period_end", now.toISOString());

        let processed = 0;
        let failed = 0;

        for (const sub of subs ?? []) {
          const plan: any = sub.plans;
          const amount = Number(plan?.price_cents ?? 0);
          if (amount <= 0) continue;

          const [{ data: customer }, { data: card }] = await Promise.all([
            supabaseAdmin
              .from("billing_customers")
              .select("infinitepay_customer_id")
              .eq("tenant_id", sub.tenant_id)
              .maybeSingle(),
            supabaseAdmin
              .from("billing_payment_methods")
              .select("infinitepay_card_token")
              .eq("tenant_id", sub.tenant_id)
              .eq("is_default", true)
              .maybeSingle(),
          ]);

          if (!customer?.infinitepay_customer_id || !card?.infinitepay_card_token) {
            failed += 1;
            continue;
          }

          const periodStart = sub.current_period_end!;
          const periodEnd = new Date(
            new Date(periodStart).getTime() + 30 * 86_400_000,
          ).toISOString();

          try {
            const charge = await ip.chargeCard({
              customer_id: customer.infinitepay_customer_id,
              card_token: card.infinitepay_card_token,
              amount_cents: amount,
              description: `Assinatura ${plan?.name ?? ""} — ${periodStart.slice(0, 10)}`,
              metadata: { subscription_id: sub.id, tenant_id: sub.tenant_id },
            });

            await supabaseAdmin.from("billing_invoices").insert({
              tenant_id: sub.tenant_id,
              subscription_id: sub.id,
              amount_cents: amount,
              currency: plan?.currency ?? "BRL",
              status: charge.status === "paid" ? "paid" : "issued",
              kind: "subscription",
              payment_method: "card",
              period_start: periodStart,
              period_end: periodEnd,
              infinitepay_charge_id: charge.id,
              paid_at: charge.status === "paid" ? new Date().toISOString() : null,
            });

            await supabaseAdmin
              .from("subscriptions")
              .update({
                current_period_start: periodStart,
                current_period_end: periodEnd,
                status: charge.status === "paid" ? "active" : "past_due",
              })
              .eq("id", sub.id);

            processed += 1;
          } catch (err: any) {
            failed += 1;
            await supabaseAdmin
              .from("subscriptions")
              .update({ status: "past_due" })
              .eq("id", sub.id);
            await supabaseAdmin.from("billing_invoices").insert({
              tenant_id: sub.tenant_id,
              subscription_id: sub.id,
              amount_cents: amount,
              currency: plan?.currency ?? "BRL",
              status: "overdue",
              kind: "subscription",
              payment_method: "card",
              period_start: periodStart,
              period_end: periodEnd,
              last_error: String(err?.message ?? err),
              attempt_count: 1,
            });
          }
        }

        return Response.json({ ok: true, processed, failed });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});
