import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendPushToUser, sendPushToLeadRecipients } from "@/server/push.server";


const SubscriptionSchema = z.object({
  endpoint: z.string().url().min(1).max(2000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(500).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SubscriptionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ endpoint: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const result = await sendPushToUser({
      userId,
      title: "Teste de notificação",
      body: "Push real chegou! ✅",
      url: "/alerts",
      tag: "alerts-test",
    });
    return result;
  });

const NotifyLeadSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  url: z.string().max(500).optional(),
  tag: z.string().max(100).optional(),
  includeAdmins: z.boolean().optional(),
  excludeSelf: z.boolean().optional().default(true),
});

/**
 * Notifica os destinatários relevantes de um lead (responsável, criador, opc. admins).
 * Verifica que o ator pode acessar o lead antes de disparar.
 */
export const notifyLeadRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NotifyLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica permissão do ator no lead via RLS (a query passa pela policy)
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead não encontrado ou sem acesso.");

    const result = await sendPushToLeadRecipients({
      leadId: data.leadId,
      title: data.title,
      body: data.body,
      url: data.url ?? `/leads/${data.leadId}`,
      tag: data.tag,
      includeAdmins: data.includeAdmins,
      excludeUserIds: data.excludeSelf ? [userId] : [],
    });
    return result;
  });
