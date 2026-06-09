import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron — daily subscription cycle runner (monthly billing on InfinitePay).
 *
 * Per active/past_due subscription whose `current_period_end` has passed:
 *   • If no invoice exists for the upcoming period → create + attempt charge.
 *   • If an unpaid invoice already exists (we're in grace) → re-attempt the
 *     charge, respecting a minimum retry interval to avoid hammering the
 *     gateway. Tracks attempt_count and last_error on the invoice.
 *
 * Failure flow:
 *   1st failure   -> status=past_due, grace_until=now+GRACE_DAYS
 *   retry pass    -> repeats every RETRY_INTERVAL_HOURS during grace
 *   grace expired -> status=suspended  (is_tenant_billing_blocked())
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
        const RETRY_INTERVAL_HOURS = 12;

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
        let retried = 0;
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

          // Look up existing invoice for this period.
          const { data: existing } = await supabaseAdmin
            .from("billing_invoices")
            .select("id, status, attempt_count, updated_at")
            .eq("subscription_id", sub.id)
            .eq("kind", "subscription")
            .eq("period_start", periodStart)
            .maybeSingle();

          if (existing?.status === "paid") {
            skipped += 1;
            continue;
          }

          // Throttle retries.
          if (existing) {
            const last = new Date(existing.updated_at ?? 0).getTime();
            const hoursSince = (now.getTime() - last) / 3_600_000;
            if (hoursSince < RETRY_INTERVAL_HOURS) {
              skipped += 1;
              continue;
            }
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

          if (!customer?.infinitepay_customer_id || !card?.infinitepay_card_token) {
            await recordFailure(
              supabaseAdmin,
              sub,
              existing,
              amount,
              plan,
              periodStart,
              periodEnd,
              "missing_payment_method",
              GRACE_DAYS,
            );
            if (sub.grace_until && new Date(sub.grace_until) < now) suspended += 1;
            failed += 1;
            continue;
          }

          try {
            const attempt = (existing?.attempt_count ?? 0) + 1;
            const charge = await ip.chargeCard({
              customer_id: customer.infinitepay_customer_id,
              card_token: card.infinitepay_card_token,
              amount_cents: amount,
              description: `Assinatura ${plan?.name ?? ""} — ${periodStart.slice(0, 10)} (tentativa ${attempt})`,
              metadata: {
                subscription_id: sub.id,
                tenant_id: sub.tenant_id,
                attempt,
              },
            });

            const paid = charge.status === "paid";

            if (existing) {
              await supabaseAdmin
                .from("billing_invoices")
                .update({
                  status: paid ? "paid" : "open",
                  attempt_count: attempt,
                  infinitepay_charge_id: charge.id,
                  paid_at: paid ? new Date().toISOString() : null,
                  last_error: paid ? null : "charge_not_paid",
                })
                .eq("id", existing.id);
            } else {
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
                attempt_count: attempt,
              });
            }

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
              if (existing) retried += 1;
              else processed += 1;
            } else {
              await markPastDue(supabaseAdmin, sub, GRACE_DAYS);
              failed += 1;
            }
          } catch (err: any) {
            await recordFailure(
              supabaseAdmin,
              sub,
              existing,
              amount,
              plan,
              periodStart,
              periodEnd,
              String(err?.message ?? err),
              GRACE_DAYS,
            );
            if (sub.grace_until && new Date(sub.grace_until) < now) suspended += 1;
            failed += 1;
          }
        }

        return Response.json({
          ok: true,
          processed,
          retried,
          failed,
          suspended,
          skipped,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});

async function markPastDue(db: any, sub: any, graceDays: number) {
  const now = new Date();
  const expired = sub.grace_until && new Date(sub.grace_until) < now;
  const grace =
    sub.grace_until ?? new Date(now.getTime() + graceDays * 86_400_000).toISOString();
  await db
    .from("subscriptions")
    .update({
      status: expired ? "suspended" : "past_due",
      grace_until: grace,
    })
    .eq("id", sub.id);
}

async function recordFailure(
  db: any,
  sub: any,
  existing: { id: string; attempt_count: number | null } | null,
  amount: number,
  plan: any,
  periodStart: string,
  periodEnd: string,
  reason: string,
  graceDays: number,
) {
  const attempt = (existing?.attempt_count ?? 0) + 1;
  if (existing) {
    await db
      .from("billing_invoices")
      .update({
        status: "uncollectible",
        attempt_count: attempt,
        last_error: reason,
      })
      .eq("id", existing.id);
  } else {
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
      attempt_count: attempt,
    });
  }
  await markPastDue(db, sub, graceDays);
}
