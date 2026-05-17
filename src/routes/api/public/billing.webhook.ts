import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Billing webhook stub — pronto para integração futura com gateway (Stripe / Mercado Pago / Pagar.me).
 *
 * Quando o gateway for ativado:
 *  - Defina o secret BILLING_WEBHOOK_SECRET (HMAC sha256).
 *  - Mapeie os eventos abaixo para os do gateway escolhido.
 *  - Use supabaseAdmin (bypassa RLS) para atualizar subscriptions/invoices.
 */
export const Route = createFileRoute("/api/public/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.BILLING_WEBHOOK_SECRET;
        const signature = request.headers.get("x-webhook-signature");
        const body = await request.text();

        if (secret) {
          const expected = createHmac("sha256", secret).update(body).digest("hex");
          if (
            !signature ||
            signature.length !== expected.length ||
            !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
          ) {
            return new Response("Invalid signature", { status: 401 });
          }
        } else {
          // Sem secret configurado ainda → não aceita eventos reais.
          return new Response("Webhook not configured", { status: 503 });
        }

        let payload: { type?: string; data?: Record<string, unknown> };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const data = (payload.data ?? {}) as {
          tenant_id?: string;
          subscription_id?: string;
          invoice_id?: string;
          gateway_invoice_id?: string;
          gateway_subscription_id?: string;
          amount_cents?: number;
          currency?: string;
          status?: string;
          current_period_end?: string;
        };

        switch (payload.type) {
          case "subscription.updated":
          case "subscription.activated": {
            if (!data.gateway_subscription_id) break;
            await supabaseAdmin
              .from("subscriptions")
              .update({
                status: (data.status as never) ?? "active",
                current_period_end: data.current_period_end ?? null,
              })
              .eq("gateway_subscription_id", data.gateway_subscription_id);
            break;
          }
          case "subscription.canceled": {
            if (!data.gateway_subscription_id) break;
            await supabaseAdmin
              .from("subscriptions")
              .update({ status: "canceled", canceled_at: new Date().toISOString() })
              .eq("gateway_subscription_id", data.gateway_subscription_id);
            break;
          }
          case "invoice.paid": {
            if (!data.gateway_invoice_id) break;
            await supabaseAdmin
              .from("billing_invoices")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("gateway_invoice_id", data.gateway_invoice_id);
            if (data.gateway_subscription_id) {
              await supabaseAdmin
                .from("subscriptions")
                .update({ status: "active" })
                .eq("gateway_subscription_id", data.gateway_subscription_id);
            }
            break;
          }
          case "invoice.payment_failed": {
            if (!data.gateway_subscription_id) break;
            await supabaseAdmin
              .from("subscriptions")
              .update({ status: "past_due" })
              .eq("gateway_subscription_id", data.gateway_subscription_id);
            break;
          }
          default:
            // Evento ignorado.
            break;
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
