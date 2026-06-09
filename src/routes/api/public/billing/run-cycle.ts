import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron — daily subscription cycle runner (monthly billing on InfinitePay).
 *
 * For each active/past_due subscription whose current_period_end is in the
 * past, attempt to charge the tenant's default card and roll the period
 * forward by 1 month. Idempotent thanks to the unique index on
 * (subscription_id, period_start) for kind='subscription'.
 *
 * Failure flow:
 *   1st failure  -> status=past_due, grace_until=+3 days, retry next run
 *   after grace  -> status=suspended  (access is blocked via
 *                   is_tenant_billing_blocked())
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
        const GRACE_DAYS = 3;

        const { data: subs, error } = await supabaseAdmin
          .from("subscriptions")
          .select(
            "id, tenant_id, status, current_period_start, current_period_end, grace_until, plans:plan_id (price_cents, currency, name, interval)",
          )
          .in("status", ["active", "past_due"])
          .lte("current_period_end", now.toISOString());
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let processed = 0;
        let failed = 0;
        let suspended = 0;
        let skipped = 0;

        for (const sub of subs ?? []) {
          const plan: any = sub.plans;
          const amount = Number(plan?.price_cents ?? 0);
          if (amount <= 0) {
            skipped += 1;
            continue;
          }

          const periodStart = sub.current_period_end!;
          const ps = new Date(periodStart);
          const pe = new Date(ps);
          pe.setMonth(pe.getMonth() + 1);
          const periodEnd = pe.toISOString();

          // Idempotency: bail if we already created an invoice for this period.
          const { data: existing } = await supabaseAdmin
            .from("billing_invoices")
            .select("id, status")
            .eq("subscription_id", sub.id)
            .eq("kind", "subscription")
            .eq("period_start", periodStart)
            .maybeSingle();
          if (existing) {
            skipped += 1;
            continue;
          }

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

          // No payment method: enter/extend past_due, suspend after grace.
          if (!customer?.infinitepay_customer_id || !card?.infinitepay_card_token) {
            await handleFailure(supabaseAdmin, sub, amount, plan, periodStart, periodEnd, "missing_payment_method", GRACE_DAYS);
            const expired = sub.grace_until && new Date(sub.grace_until) < now;
            if (expired) suspended += 1;
            failed += 1;
            continue;
          }

          try {
            const charge = await ip.chargeCard({
              customer_id: customer.infinitepay_customer_id,
              card_token: card.infinitepay_card_token,
              amount_cents: amount,
              description: `Assinatura ${plan?.name ?? ""} — ${periodStart.slice(0, 10)}`,
              metadata: { subscription_id: sub.id, tenant_id: sub.tenant_id },
            });

            const paid = charge.status === "paid";

            await supabaseAdmin.from("billing_invoices").insert({
              tenant_id: sub.tenant_id,
              subscription_id: sub.id,
              amount_cents: amount,
              currency: plan?.currency ?? "BRL",
              status: paid ? "paid" : "open",
              kind: "subscription",
              payment_method: "card",
              period_start: periodStart,
              period_end: periodEnd,
              infinitepay_charge_id: charge.id,
              paid_at: paid ? new Date().toISOString() : null,
              attempt_count: 1,
            });

            if (paid) {
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  current_period_start: periodStart,
                  current_period_end: periodEnd,
                  status: "active",
                  grace_until: null,
                })
                .eq("id", sub.id);
              processed += 1;
            } else {
              // Charge pending/failed at the gateway — keep past_due, await webhook.
              await markPastDue(supabaseAdmin, sub, GRACE_DAYS);
              failed += 1;
            }
          } catch (err: any) {
            await handleFailure(supabaseAdmin, sub, amount, plan, periodStart, periodEnd, String(err?.message ?? err), GRACE_DAYS);
            const expired = sub.grace_until && new Date(sub.grace_until) < now;
            if (expired) suspended += 1;
            failed += 1;
          }
        }

        return Response.json({ ok: true, processed, failed, suspended, skipped });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});

async function markPastDue(db: any, sub: any, graceDays: number) {
  const grace = sub.grace_until ?? new Date(Date.now() + graceDays * 86_400_000).toISOString();
  const now = new Date();
  const expired = sub.grace_until && new Date(sub.grace_until) < now;
  await db
    .from("subscriptions")
    .update({
      status: expired ? "suspended" : "past_due",
      grace_until: grace,
    })
    .eq("id", sub.id);
}

async function handleFailure(
  db: any,
  sub: any,
  amount: number,
  plan: any,
  periodStart: string,
  periodEnd: string,
  reason: string,
  graceDays: number,
) {
  await db.from("billing_invoices").insert({
    tenant_id: sub.tenant_id,
    subscription_id: sub.id,
    amount_cents: amount,
    currency: plan?.currency ?? "BRL",
    status: "uncollectible",
    kind: "subscription",
    payment_method: "card",
    period_start: periodStart,
    period_end: periodEnd,
    last_error: reason,
    attempt_count: 1,
  });
  await markPastDue(db, sub, graceDays);
}
