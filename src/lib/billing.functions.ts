import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─────────────────── helper: ensure caller is tenant owner ───────────────────
async function requireOwner(ctx: any, tenantId: string) {
  const { supabase, userId } = ctx;
  const { data, error } = await supabase.rpc("is_tenant_owner", {
    _tenant_id: tenantId,
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden: tenant owner only");
}

// ─────────────────────────── overview ───────────────────────────
export const getBillingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;

    const [{ data: sub }, { data: wallet }, { data: customer }, { data: pms }, { count: activeUsers }] =
      await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "id, status, trial_end, current_period_start, current_period_end, cancel_at_period_end, plans:plan_id (id, code, name, price_cents, currency, interval, included_users, extra_user_cents, features)",
          )
          .eq("tenant_id", data.tenant_id)
          .maybeSingle(),
        supabase
          .from("billing_credit_wallet")
          .select("ai_credits, storage_gb_extra, updated_at")
          .eq("tenant_id", data.tenant_id)
          .maybeSingle(),
        supabase
          .from("billing_customers")
          .select("*")
          .eq("tenant_id", data.tenant_id)
          .maybeSingle(),
        supabase
          .from("billing_payment_methods")
          .select("id, brand, last4, exp_month, exp_year, is_default")
          .eq("tenant_id", data.tenant_id)
          .order("is_default", { ascending: false }),
        supabase
          .from("tenant_members")
          .select("user_id", { count: "exact", head: true })
          .eq("tenant_id", data.tenant_id)
          .eq("is_active", true),
      ]);

    // Current cycle AI usage
    const cycleStart =
      sub?.current_period_start ?? new Date(new Date().setDate(1)).toISOString();
    const { data: aiAgg } = await supabase
      .from("usage_ai_events")
      .select("total_tokens, credits_charged")
      .eq("tenant_id", data.tenant_id)
      .gte("created_at", cycleStart);

    const aiUsed = (aiAgg ?? []).reduce(
      (acc, r: any) => acc + Number(r.credits_charged ?? 0),
      0,
    );

    // Latest storage snapshot per bucket
    const { data: storage } = await supabase
      .from("usage_storage_daily")
      .select("bucket, bytes, file_count, snapshot_date")
      .eq("tenant_id", data.tenant_id)
      .order("snapshot_date", { ascending: false })
      .limit(50);

    return {
      subscription: sub,
      wallet: wallet ?? { ai_credits: 0, storage_gb_extra: 0 },
      customer,
      payment_methods: pms ?? [],
      ai_used_in_cycle: aiUsed,
      storage_latest: storage ?? [],
      active_users: activeUsers ?? 0,
    };
  });

// ─────────────────────────── usage: AI ───────────────────────────
export const getUsageAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    const from = data.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = data.to ?? new Date().toISOString();

    const { data: events } = await supabase
      .from("usage_ai_events")
      .select(
        "id, user_id, feature, model, prompt_tokens, completion_tokens, total_tokens, credits_charged, created_at",
      )
      .eq("tenant_id", data.tenant_id)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false })
      .limit(500);

    return { events: events ?? [] };
  });

// ─────────────────────────── usage: storage ───────────────────────────
export const getUsageStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenant_id: z.string().uuid(), days: z.number().min(1).max(180).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    const days = data.days ?? 30;
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const { data: rows } = await supabase
      .from("usage_storage_daily")
      .select("bucket, bytes, file_count, snapshot_date")
      .eq("tenant_id", data.tenant_id)
      .gte("snapshot_date", from)
      .order("snapshot_date", { ascending: true });

    return { rows: rows ?? [] };
  });

// ─────────────────────────── invoices ───────────────────────────
export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("billing_invoices")
      .select(
        "id, kind, status, amount_cents, currency, due_date, paid_at, payment_method, pix_qr, pix_copia_cola, boleto_url, hosted_invoice_url, period_start, period_end, created_at",
      )
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { invoices: rows ?? [] };
  });

// ─────────────────────────── customer data ───────────────────────────
export const upsertBillingCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        legal_name: z.string().min(2).max(200),
        doc_type: z.enum(["cpf", "cnpj"]),
        doc_number: z.string().min(11).max(20),
        email: z.string().email(),
        phone: z.string().max(40).optional(),
        address: z.record(z.string(), z.any()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;

    // Try create remote customer if no id yet
    const { data: existing } = await supabase
      .from("billing_customers")
      .select("id, infinitepay_customer_id")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    let infiniteId = existing?.infinitepay_customer_id ?? null;
    if (!infiniteId) {
      try {
        const { createCustomer } = await import("@/server/infinitepay.server");
        const created = await createCustomer({
          legal_name: data.legal_name,
          doc_type: data.doc_type,
          doc_number: data.doc_number,
          email: data.email,
          phone: data.phone,
          address: data.address,
        });
        infiniteId = created.id;
      } catch (err) {
        console.error("[billing] createCustomer failed", err);
        // proceed; remote id can be filled later
      }
    }

    const { error } = await supabase
      .from("billing_customers")
      .upsert(
        {
          tenant_id: data.tenant_id,
          legal_name: data.legal_name,
          doc_type: data.doc_type,
          doc_number: data.doc_number,
          email: data.email,
          phone: data.phone ?? null,
          address: data.address ?? {},
          infinitepay_customer_id: infiniteId,
        },
        { onConflict: "tenant_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────── cards ───────────────────────────
export const addPaymentCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        number: z.string().min(12).max(25),
        holder_name: z.string().min(2).max(120),
        exp_month: z.number().min(1).max(12),
        exp_year: z.number().min(2025).max(2099),
        cvv: z.string().min(3).max(4),
        set_default: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;

    const { data: customer } = await supabase
      .from("billing_customers")
      .select("infinitepay_customer_id")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (!customer?.infinitepay_customer_id) {
      throw new Error("Preencha os dados de cobrança antes de adicionar um cartão.");
    }

    const { tokenizeCard } = await import("@/server/infinitepay.server");
    const tok = await tokenizeCard({
      customer_id: customer.infinitepay_customer_id,
      number: data.number.replace(/\s+/g, ""),
      holder_name: data.holder_name,
      exp_month: data.exp_month,
      exp_year: data.exp_year,
      cvv: data.cvv,
    });

    if (data.set_default) {
      await supabase
        .from("billing_payment_methods")
        .update({ is_default: false })
        .eq("tenant_id", data.tenant_id);
    }

    const { error } = await supabase.from("billing_payment_methods").insert({
      tenant_id: data.tenant_id,
      infinitepay_card_token: tok.token,
      brand: tok.brand,
      last4: tok.last4,
      exp_month: tok.exp_month,
      exp_year: tok.exp_year,
      holder_name: data.holder_name,
      is_default: !!data.set_default,
    });
    if (error) throw new Error(error.message);
    return { ok: true, last4: tok.last4, brand: tok.brand };
  });

export const setDefaultCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenant_id: z.string().uuid(), card_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    await supabase
      .from("billing_payment_methods")
      .update({ is_default: false })
      .eq("tenant_id", data.tenant_id);
    const { error } = await supabase
      .from("billing_payment_methods")
      .update({ is_default: true })
      .eq("id", data.card_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenant_id: z.string().uuid(), card_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    const { error } = await supabase
      .from("billing_payment_methods")
      .delete()
      .eq("id", data.card_id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────── top-up ───────────────────────────
export const createTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        resource: z.enum(["ai_credits", "storage_gb"]),
        quantity: z.number().positive(),
        payment_method: z.enum(["card", "pix", "boleto"]),
        card_id: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;

    // Pricing table — adjust to your real catalog.
    const unitPriceCents =
      data.resource === "ai_credits" ? 1 /* per 1K tokens */ : 200 /* per GB-mês */;
    const amount_cents = Math.max(
      100,
      Math.round(unitPriceCents * data.quantity),
    );

    const { data: customer } = await supabase
      .from("billing_customers")
      .select("infinitepay_customer_id")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (!customer?.infinitepay_customer_id) {
      throw new Error("Preencha os dados de cobrança primeiro.");
    }

    const description =
      data.resource === "ai_credits"
        ? `Recarga ${data.quantity}K tokens de IA`
        : `Recarga ${data.quantity} GB de armazenamento`;

    const ip = await import("@/server/infinitepay.server");
    let charge;
    if (data.payment_method === "pix") {
      charge = await ip.createPixCharge({
        customer_id: customer.infinitepay_customer_id,
        amount_cents,
        description,
      });
    } else if (data.payment_method === "boleto") {
      charge = await ip.createBoletoCharge({
        customer_id: customer.infinitepay_customer_id,
        amount_cents,
        description,
      });
    } else {
      if (!data.card_id) throw new Error("card_id obrigatório para cartão.");
      const { data: card } = await supabase
        .from("billing_payment_methods")
        .select("infinitepay_card_token")
        .eq("id", data.card_id)
        .eq("tenant_id", data.tenant_id)
        .maybeSingle();
      if (!card) throw new Error("Cartão não encontrado.");
      charge = await ip.chargeCard({
        customer_id: customer.infinitepay_customer_id,
        card_token: card.infinitepay_card_token,
        amount_cents,
        description,
      });
    }

    // Create invoice + topup linked to charge
    const { data: inv, error: invErr } = await supabase
      .from("billing_invoices")
      .insert({
        tenant_id: data.tenant_id,
        amount_cents,
        currency: "BRL",
        status: charge.status === "paid" ? "paid" : "open",
        kind: "topup",
        payment_method: data.payment_method,
        pix_qr: charge.pix?.qr_code ?? null,
        pix_copia_cola: charge.pix?.copia_cola ?? null,
        boleto_url: charge.boleto?.url ?? null,
        infinitepay_charge_id: charge.id,
        paid_at: charge.status === "paid" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (invErr) throw new Error(invErr.message);

    await supabase.from("billing_topups").insert({
      tenant_id: data.tenant_id,
      resource: data.resource,
      quantity: data.quantity,
      amount_cents,
      payment_method: data.payment_method,
      status: charge.status === "paid" ? "paid" : "pending",
      invoice_id: inv.id,
      infinitepay_charge_id: charge.id,
    });

    return {
      ok: true,
      charge_id: charge.id,
      status: charge.status,
      amount_cents,
      pix: charge.pix,
      boleto: charge.boleto,
      invoice_id: inv.id,
    };
  });

// ─────────────────────────── subscription mgmt ───────────────────────────
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    const { error } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true, canceled_at: new Date().toISOString() })
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────── list public plans ───────────────────────────
export const listPublicPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("plans")
      .select("id, code, name, price_cents, currency, interval, included_users, extra_user_cents, features, sort_order")
      .eq("is_public", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: data ?? [] };
  });

// ─────────────────────────── change plan ───────────────────────────
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ tenant_id: z.string().uuid(), plan_code: z.string().min(1).max(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context, data.tenant_id);
    const { supabase } = context;
    const { data: plan, error: pErr } = await supabase
      .from("plans")
      .select("id")
      .eq("code", data.plan_code)
      .eq("is_public", true)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plan) throw new Error("Plano não encontrado");

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("subscriptions")
        .update({ plan_id: plan.id, cancel_at_period_end: false, canceled_at: null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const now = new Date();
      const end = new Date(now);
      end.setMonth(end.getMonth() + 1);
      const { error } = await supabase.from("subscriptions").insert({
        tenant_id: data.tenant_id,
        plan_id: plan.id,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
