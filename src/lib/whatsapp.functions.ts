import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptSecret, decryptSecret } from "@/server/whatsapp-crypto.server";
import {
  sendText,
  sendMedia,
  sendTemplate,
  metaJson,
} from "@/server/whatsapp-meta.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import crypto from "crypto";

const phoneRegex = /^\+?[1-9]\d{6,15}$/;

function normalizePhone(p: string) {
  const digits = p.replace(/\D/g, "");
  return digits;
}

// ---------- Connect Account ----------
export const connectWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        phoneNumberId: z.string().min(3).max(64).regex(/^\d+$/),
        wabaId: z.string().min(3).max(64).regex(/^\d+$/),
        accessToken: z.string().min(20).max(2000),
        appSecret: z.string().min(8).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate token by querying /{phone_number_id}
    const info = await metaJson<{ display_phone_number?: string; verified_name?: string }>(
      `/${data.phoneNumberId}`,
      data.accessToken,
    );

    const verifyToken = crypto.randomBytes(24).toString("hex");

    const { data: row, error } = await supabase
      .from("whatsapp_accounts")
      .upsert(
        {
          user_id: userId,
          phone_number_id: data.phoneNumberId,
          waba_id: data.wabaId,
          display_phone: info.display_phone_number ?? data.phoneNumberId,
          display_name: info.verified_name ?? null,
          access_token_encrypted: encryptSecret(data.accessToken),
          app_secret_encrypted: data.appSecret ? encryptSecret(data.appSecret) : null,
          webhook_verify_token: verifyToken,
          status: "active",
          last_error: null,
        },
        { onConflict: "phone_number_id" },
      )
      .select("id, display_phone, display_name, webhook_verify_token")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const disconnectWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- List accounts ----------
export const listWhatsappAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_accounts")
      .select("id, display_phone, display_name, status, phone_number_id, waba_id, webhook_verify_token, connected_at")
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { accounts: data ?? [] };
  });

// ---------- Send messages ----------
async function loadAccount(accountId: string, userId: string, isAdmin: boolean) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Account not found");
  if (!isAdmin && data.user_id !== userId) throw new Error("Forbidden");
  const token = decryptSecret(data.access_token_encrypted);
  return { account: data, token };
}

async function ensureConversation(opts: {
  accountId: string;
  contactPhone: string;
  contactName?: string | null;
}) {
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, lead_id, customer_id")
    .eq("account_id", opts.accountId)
    .eq("contact_phone", opts.contactPhone)
    .maybeSingle();
  if (existing) return existing.id;

  // Try to link to lead/customer by phone
  let leadId: string | null = null;
  let customerId: string | null = null;
  const phoneDigits = opts.contactPhone.replace(/\D/g, "");
  if (phoneDigits.length >= 8) {
    const last = phoneDigits.slice(-8);
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .ilike("phone", `%${last}%`)
      .limit(1)
      .maybeSingle();
    if (lead) leadId = lead.id;
    const { data: cust } = await supabaseAdmin
      .from("customers")
      .select("id")
      .ilike("phone", `%${last}%`)
      .limit(1)
      .maybeSingle();
    if (cust) customerId = cust.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      account_id: opts.accountId,
      contact_phone: opts.contactPhone,
      contact_name: opts.contactName ?? null,
      lead_id: leadId,
      customer_id: customerId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

export const sendWhatsappText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        to: z.string().regex(phoneRegex, "Invalid phone (E.164)"),
        body: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = context.claims?.app_metadata?.roles?.includes?.("admin") ?? false;
    const { account, token } = await loadAccount(data.accountId, context.userId, isAdmin);
    const to = normalizePhone(data.to);

    // Check 24h window
    const { data: conv } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("window_expires_at")
      .eq("account_id", account.id)
      .eq("contact_phone", to)
      .maybeSingle();
    if (conv?.window_expires_at && new Date(conv.window_expires_at) < new Date()) {
      throw new Error("Janela de 24h expirou. Use um template aprovado.");
    }

    const result = await sendText({
      phoneNumberId: account.phone_number_id,
      token,
      to,
      body: data.body,
    });

    const conversationId = await ensureConversation({
      accountId: account.id,
      contactPhone: to,
    });
    const waMsgId = result.messages?.[0]?.id ?? null;

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      account_id: account.id,
      direction: "out",
      wa_message_id: waMsgId,
      type: "text",
      body: data.body,
      status: "sent",
      sent_by: context.userId,
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: data.body.slice(0, 200),
      })
      .eq("id", conversationId);

    return { messageId: waMsgId };
  });

export const sendWhatsappMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        to: z.string().regex(phoneRegex),
        mediaType: z.enum(["image", "document", "audio", "video"]),
        link: z.string().url(),
        caption: z.string().max(1024).optional(),
        filename: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = context.claims?.app_metadata?.roles?.includes?.("admin") ?? false;
    const { account, token } = await loadAccount(data.accountId, context.userId, isAdmin);
    const to = normalizePhone(data.to);

    const result = await sendMedia({
      phoneNumberId: account.phone_number_id,
      token,
      to,
      mediaType: data.mediaType,
      link: data.link,
      caption: data.caption,
      filename: data.filename,
    });

    const conversationId = await ensureConversation({ accountId: account.id, contactPhone: to });
    const waMsgId = result.messages?.[0]?.id ?? null;

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      account_id: account.id,
      direction: "out",
      wa_message_id: waMsgId,
      type: data.mediaType,
      body: data.caption ?? null,
      media_url: data.link,
      media_filename: data.filename ?? null,
      status: "sent",
      sent_by: context.userId,
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: `[${data.mediaType}] ${data.caption ?? data.filename ?? ""}`.slice(0, 200),
      })
      .eq("id", conversationId);

    return { messageId: waMsgId };
  });

export const sendWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        accountId: z.string().uuid(),
        to: z.string().regex(phoneRegex),
        templateName: z.string().min(1).max(200),
        language: z.string().min(2).max(10),
        variables: z.array(z.string().max(500)).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = context.claims?.app_metadata?.roles?.includes?.("admin") ?? false;
    const { account, token } = await loadAccount(data.accountId, context.userId, isAdmin);
    const to = normalizePhone(data.to);

    const result = await sendTemplate({
      phoneNumberId: account.phone_number_id,
      token,
      to,
      templateName: data.templateName,
      language: data.language,
      variables: data.variables,
    });

    const conversationId = await ensureConversation({ accountId: account.id, contactPhone: to });
    const waMsgId = result.messages?.[0]?.id ?? null;

    await supabaseAdmin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      account_id: account.id,
      direction: "out",
      wa_message_id: waMsgId,
      type: "template",
      template_name: data.templateName,
      body: `[Template: ${data.templateName}]`,
      status: "sent",
      sent_by: context.userId,
    });

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: `[template] ${data.templateName}`,
      })
      .eq("id", conversationId);

    return { messageId: waMsgId };
  });

// ---------- Sync templates ----------
export const syncWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = context.claims?.app_metadata?.roles?.includes?.("admin") ?? false;
    const { account, token } = await loadAccount(data.accountId, context.userId, isAdmin);

    const res = await metaJson<{
      data: Array<{
        name: string;
        language: string;
        category?: string;
        status?: string;
        components?: unknown;
      }>;
    }>(`/${account.waba_id}/message_templates?limit=200`, token);

    const rows = (res.data ?? []).map((t) => ({
      account_id: account.id,
      name: t.name,
      language: t.language,
      category: t.category ?? null,
      status: t.status ?? null,
      components: (t.components ?? null) as never,
      synced_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      await supabaseAdmin
        .from("whatsapp_templates")
        .upsert(rows, { onConflict: "account_id,name,language" });
    }
    return { count: rows.length };
  });
