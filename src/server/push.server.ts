// Server-only helpers para Web Push.
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationEventType =
  | "lead_assigned"
  | "lead_status_changed"
  | "task_due_soon"
  | "task_overdue"
  | "sla_warning"
  | "sla_overdue";

type SendArgs = {
  userId: string;
  title: string;
  body?: string;
  url?: string;
  leadId?: string | null;
  tag?: string;
  /** Se informado, respeita notification_preferences do usuário. */
  eventType?: NotificationEventType;
};

/** Verifica se o usuário aceita receber pushes para um determinado evento. */
export async function isEventEnabledForUser(
  userId: string,
  eventType: NotificationEventType,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .select("push_enabled")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .maybeSingle();
  if (error) return true; // fail-open: por padrão envia
  if (!data) return true; // sem registro = padrão ligado
  return data.push_enabled;
}

type SendResult = {
  total: number;
  sent: number;
  failed: number;
  errors: string[];
};

export async function sendPushToUser(args: SendArgs): Promise<SendResult> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", args.userId);
  if (error) throw new Error(error.message);

  const result: SendResult = { total: subs?.length ?? 0, sent: 0, failed: 0, errors: [] };
  if (!subs || subs.length === 0) return result;

  const message = {
    data: {
      title: args.title,
      body: args.body ?? "",
      url: args.url ?? "/alerts",
      leadId: args.leadId ?? null,
      tag: args.tag ?? "lead-alert",
    },
    options: { ttl: 60 * 60 * 24, urgency: "normal" as const },
  };

  await Promise.all(
    subs.map(async (s) => {
      try {
        const payload = await buildPushPayload(
          message,
          { endpoint: s.endpoint, expirationTime: null, keys: { auth: s.auth, p256dh: s.p256dh } },
          { subject, publicKey, privateKey },
        );
        const res = await fetch(s.endpoint, {
          method: payload.method,
          headers: payload.headers as unknown as Record<string, string>,
          body: payload.body as BodyInit,
        });
        if (res.status === 404 || res.status === 410) {
          // Subscription invalidada — remover
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
          result.failed++;
          result.errors.push(`gone (${res.status})`);
        } else if (!res.ok) {
          const text = await res.text().catch(() => "");
          result.failed++;
          result.errors.push(`${res.status} ${text.slice(0, 200)}`);
        } else {
          result.sent++;
        }
      } catch (e: unknown) {
        result.failed++;
        result.errors.push(e instanceof Error ? e.message : String(e));
      }
    }),
  );

  // Log único por chamada (resumo)
  await supabaseAdmin.from("notification_logs").insert({
    user_id: args.userId,
    lead_id: args.leadId ?? null,
    channel: "push",
    status: result.sent > 0 ? "success" : result.total === 0 ? "skipped" : "error",
    title: args.title,
    body: args.body ?? null,
    error_detail: result.errors.length ? result.errors.join(" | ").slice(0, 1000) : null,
    metadata: { sent: result.sent, failed: result.failed, total: result.total },
  });

  return result;
}

type LeadRecipientArgs = {
  leadId: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  /** Quando true, também notifica administradores (default: false). */
  includeAdmins?: boolean;
  /** IDs a excluir (ex.: o ator que disparou o evento). */
  excludeUserIds?: string[];
};

/** Resolve quem deve ser notificado sobre um lead (responsável + criador, opcionalmente admins). */
export async function resolveLeadRecipients(
  leadId: string,
  opts?: { includeAdmins?: boolean; excludeUserIds?: string[] },
): Promise<string[]> {
  const exclude = new Set(opts?.excludeUserIds ?? []);
  const recipients = new Set<string>();

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("assigned_to, created_by")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (lead?.assigned_to) recipients.add(lead.assigned_to);
  if (lead?.created_by) recipients.add(lead.created_by);

  if (opts?.includeAdmins) {
    const { data: admins, error: aErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (aErr) throw new Error(aErr.message);
    admins?.forEach((r) => r.user_id && recipients.add(r.user_id));
  }

  for (const id of exclude) recipients.delete(id);
  return Array.from(recipients);
}

/** Envia push para todos os destinatários relevantes do lead. */
export async function sendPushToLeadRecipients(
  args: LeadRecipientArgs,
): Promise<{ recipients: string[]; perUser: Record<string, SendResult> }> {
  const recipients = await resolveLeadRecipients(args.leadId, {
    includeAdmins: args.includeAdmins,
    excludeUserIds: args.excludeUserIds,
  });

  const perUser: Record<string, SendResult> = {};
  await Promise.all(
    recipients.map(async (uid) => {
      perUser[uid] = await sendPushToUser({
        userId: uid,
        title: args.title,
        body: args.body,
        url: args.url,
        leadId: args.leadId,
        tag: args.tag,
      });
    }),
  );
  return { recipients, perUser };
}
