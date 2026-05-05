// Server-only helpers para Web Push.
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendArgs = {
  userId: string;
  title: string;
  body?: string;
  url?: string;
  leadId?: string | null;
  tag?: string;
};

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
