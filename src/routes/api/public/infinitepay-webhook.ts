import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/infinitepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INFINITEPAY_WEBHOOK_SECRET;
        if (!secret) return new Response("config missing", { status: 500 });

        const sig = request.headers.get("x-infinitepay-signature") || "";
        const body = await request.text();

        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(sig, "utf8");
        const expBuf = Buffer.from(expected, "utf8");
        if (
          sigBuf.length !== expBuf.length ||
          !timingSafeEqual(sigBuf, expBuf)
        ) {
          return new Response("invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const event = payload.event ?? payload.type;
        const charge = payload.data ?? payload.charge ?? payload;
        const chargeId: string | undefined = charge?.id;
        if (!chargeId) return new Response("no charge id", { status: 200 });

        // Look up invoice/topup
        const { data: invoice } = await supabaseAdmin
          .from("billing_invoices")
          .select("id, tenant_id, kind, status")
          .eq("infinitepay_charge_id", chargeId)
          .maybeSingle();

        if (!invoice) return new Response("ok (unknown charge)", { status: 200 });

        if (event === "charge.paid" || event === "charge.confirmed") {
          await supabaseAdmin
            .from("billing_invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", invoice.id);

          // Subscription invoice paid -> unblock tenant access.
          if (invoice.kind === "subscription") {
            const { data: invFull } = await supabaseAdmin
              .from("billing_invoices")
              .select("subscription_id, period_start, period_end")
              .eq("id", invoice.id)
              .maybeSingle();
            if (invFull?.subscription_id) {
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  status: "active",
                  grace_until: null,
                  current_period_start: invFull.period_start,
                  current_period_end: invFull.period_end,
                })
                .eq("id", invFull.subscription_id);
            }
          }

          if (invoice.kind === "topup") {
            const { data: topup } = await supabaseAdmin
              .from("billing_topups")
              .select("id, resource, quantity, status")
              .eq("invoice_id", invoice.id)
              .maybeSingle();
            if (topup && topup.status !== "paid") {
              await supabaseAdmin
                .from("billing_topups")
                .update({ status: "paid" })
                .eq("id", topup.id);
              // Credit wallet
              const { data: wallet } = await supabaseAdmin
                .from("billing_credit_wallet")
                .select("ai_credits, storage_gb_extra")
                .eq("tenant_id", invoice.tenant_id)
                .maybeSingle();
              const ai = Number(wallet?.ai_credits ?? 0);
              const st = Number(wallet?.storage_gb_extra ?? 0);
              const addAi = topup.resource === "ai_credits" ? Number(topup.quantity) * 1000 : 0;
              const addSt = topup.resource === "storage_gb" ? Number(topup.quantity) : 0;
              await supabaseAdmin
                .from("billing_credit_wallet")
                .upsert({
                  tenant_id: invoice.tenant_id,
                  ai_credits: ai + addAi,
                  storage_gb_extra: st + addSt,
                  updated_at: new Date().toISOString(),
                });
              await supabaseAdmin.from("billing_credit_ledger").insert({
                tenant_id: invoice.tenant_id,
                kind: "topup",
                resource: topup.resource,
                amount: topup.resource === "ai_credits" ? addAi : addSt,
                balance_after: topup.resource === "ai_credits" ? ai + addAi : st + addSt,
                reference_type: "topup",
                reference_id: topup.id,
              });
            }
          }
        } else if (event === "charge.failed" || event === "charge.refused") {
          await supabaseAdmin
            .from("billing_invoices")
            .update({ status: "uncollectible", last_error: charge?.failure_reason ?? null })
            .eq("id", invoice.id);
        } else if (event === "charge.refunded") {
          await supabaseAdmin
            .from("billing_invoices")
            .update({ status: "void" })
            .eq("id", invoice.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
