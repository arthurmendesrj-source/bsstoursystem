import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "@/server/whatsapp-crypto.server";
import { fetchMediaUrl, downloadMedia } from "@/server/whatsapp-meta.server";
import crypto from "crypto";

interface MetaWebhookValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; mime_type?: string; caption?: string };
    document?: { id: string; mime_type?: string; filename?: string; caption?: string };
    audio?: { id: string; mime_type?: string };
    video?: { id: string; mime_type?: string; caption?: string };
  }>;
  statuses?: Array<{ id: string; status: string; timestamp: string; errors?: Array<{ code: number; title: string }> }>;
}

interface MetaWebhookPayload {
  entry?: Array<{ changes?: Array<{ value: MetaWebhookValue }> }>;
}

async function findAccountByPhoneNumberId(phoneNumberId: string) {
  const { data } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  return data;
}

async function ensureConversation(accountId: string, contactPhone: string, contactName?: string | null) {
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("account_id", accountId)
    .eq("contact_phone", contactPhone)
    .maybeSingle();
  if (existing) return existing.id;

  const phoneDigits = contactPhone.replace(/\D/g, "");
  let leadId: string | null = null;
  let customerId: string | null = null;
  if (phoneDigits.length >= 8) {
    const last = phoneDigits.slice(-8);
    const { data: lead } = await supabaseAdmin
      .from("leads").select("id").ilike("phone", `%${last}%`).limit(1).maybeSingle();
    if (lead) leadId = lead.id;
    const { data: cust } = await supabaseAdmin
      .from("customers").select("id").ilike("phone", `%${last}%`).limit(1).maybeSingle();
    if (cust) customerId = cust.id;
  }

  const { data: created } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      account_id: accountId,
      contact_phone: contactPhone,
      contact_name: contactName ?? null,
      lead_id: leadId,
      customer_id: customerId,
    })
    .select("id")
    .single();
  return created!.id;
}

async function downloadAndStoreMedia(
  mediaId: string,
  token: string,
  tenantId: string,
  accountId: string,
): Promise<{ path: string; mime: string } | null> {
  try {
    const meta = await fetchMediaUrl(mediaId, token);
    const { buf, mime } = await downloadMedia(meta.url, token);
    const ext = (meta.mime_type ?? mime).split("/")[1]?.split(";")[0] ?? "bin";
    const path = `${tenantId}/${accountId}/${mediaId}.${ext}`;
    await supabaseAdmin.storage.from("whatsapp-media").upload(path, buf, {
      contentType: meta.mime_type ?? mime,
      upsert: true,
    });
    return { path, mime: meta.mime_type ?? mime };
  } catch (e) {
    console.error("[whatsapp webhook] media download failed:", e);
    return null;
  }
}

async function processIncoming(value: MetaWebhookValue) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const account = await findAccountByPhoneNumberId(phoneNumberId);
  if (!account) return;

  // Status updates (delivery/read receipts)
  if (value.statuses?.length) {
    for (const s of value.statuses) {
      const update: Record<string, unknown> = { status: s.status };
      if (s.status === "delivered") update.delivered_at = new Date(Number(s.timestamp) * 1000).toISOString();
      if (s.status === "read") update.read_at = new Date(Number(s.timestamp) * 1000).toISOString();
      if (s.errors?.length) {
        update.error_code = String(s.errors[0].code);
        update.error_message = s.errors[0].title;
        update.status = "failed";
      }
      await supabaseAdmin
        .from("whatsapp_messages")
        .update(update as never)
        .eq("account_id", account.id)
        .eq("wa_message_id", s.id);
    }
  }

  // Inbound messages
  if (value.messages?.length) {
    const token = decryptSecret(account.access_token_encrypted);
    const contact = value.contacts?.[0];
    for (const m of value.messages) {
      const conversationId = await ensureConversation(account.id, m.from, contact?.profile?.name ?? null);

      let body: string | null = null;
      let mediaPath: string | null = null;
      let mediaMime: string | null = null;
      let mediaFilename: string | null = null;

      if (m.type === "text") {
        body = m.text?.body ?? null;
      } else if (m.type === "image" && m.image?.id) {
        body = m.image.caption ?? null;
        const stored = await downloadAndStoreMedia(m.image.id, token, account.id);
        mediaPath = stored?.path ?? null;
        mediaMime = stored?.mime ?? m.image.mime_type ?? null;
      } else if (m.type === "document" && m.document?.id) {
        body = m.document.caption ?? null;
        mediaFilename = m.document.filename ?? null;
        const stored = await downloadAndStoreMedia(m.document.id, token, account.id);
        mediaPath = stored?.path ?? null;
        mediaMime = stored?.mime ?? m.document.mime_type ?? null;
      } else if (m.type === "audio" && m.audio?.id) {
        const stored = await downloadAndStoreMedia(m.audio.id, token, account.id);
        mediaPath = stored?.path ?? null;
        mediaMime = stored?.mime ?? m.audio.mime_type ?? null;
      } else if (m.type === "video" && m.video?.id) {
        body = m.video.caption ?? null;
        const stored = await downloadAndStoreMedia(m.video.id, token, account.id);
        mediaPath = stored?.path ?? null;
        mediaMime = stored?.mime ?? m.video.mime_type ?? null;
      }

      const sentAt = new Date(Number(m.timestamp) * 1000).toISOString();
      await supabaseAdmin
        .from("whatsapp_messages")
        .upsert(
          {
            conversation_id: conversationId,
            account_id: account.id,
            direction: "in",
            wa_message_id: m.id,
            type: m.type,
            body,
            media_storage_path: mediaPath,
            media_mime: mediaMime,
            media_filename: mediaFilename,
            status: "received",
            sent_at: sentAt,
            raw: m as never,
          },
          { onConflict: "account_id,wa_message_id" },
        );

      const preview = body ?? `[${m.type}]`;
      const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          last_message_at: sentAt,
          last_message_preview: preview.slice(0, 200),
          last_inbound_at: sentAt,
          window_expires_at: windowExpires,
          contact_name: contact?.profile?.name ?? undefined,
        })
        .eq("id", conversationId);
    }
  }
}

function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Webhook verification handshake from Meta
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token || !challenge) {
          return new Response("Bad Request", { status: 400 });
        }
        const { data } = await supabaseAdmin
          .from("whatsapp_accounts")
          .select("id")
          .eq("webhook_verify_token", token)
          .maybeSingle();
        if (!data) return new Response("Forbidden", { status: 403 });
        return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256");

        let payload: MetaWebhookPayload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Verify signature using each account's app_secret if provided.
        // Find the account by phone_number_id from the payload, then check signature.
        const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
        if (phoneNumberId) {
          const account = await findAccountByPhoneNumberId(phoneNumberId);
          if (account?.app_secret_encrypted) {
            const appSecret = decryptSecret(account.app_secret_encrypted);
            if (!verifySignature(rawBody, signature, appSecret)) {
              return new Response("Invalid signature", { status: 401 });
            }
          }
        }

        try {
          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              await processIncoming(change.value);
            }
          }
        } catch (e) {
          console.error("[whatsapp webhook] processing error:", e);
          // Still 200 to avoid retries when partial success
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
