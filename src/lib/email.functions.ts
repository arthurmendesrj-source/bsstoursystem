import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";

const folderSchema = z.enum(["inbox", "sent"]);

// Authorize: caller is the target OR caller manages target OR caller is admin
async function authorize(supabase: any, callerId: string, targetUserId: string) {
  if (callerId === targetUserId) return true;
  const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: callerId });
  if (isAdmin) return true;
  const { data: isSub } = await supabase.rpc("is_subordinate_of", {
    _target: targetUserId,
    _manager: callerId,
  });
  return Boolean(isSub);
}

function currentOrigin(): string {
  try {
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost();
    return `${proto}://${host}`;
  } catch {
    return "https://bsstoursystem.lovable.app";
  }
}

// Initiate per-user OAuth. Returns the Google consent URL.
export const connectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password?: string }) => d ?? {})
  .handler(async ({ context }) => {
    const { buildAuthUrl, buildRedirectUri, signState } = await import(
      "./google-oauth.server"
    );
    const origin = currentOrigin();
    const redirectUri = buildRedirectUri(origin);
    const state = signState(context.userId);
    const authUrl = buildAuthUrl(state, redirectUri);
    return { ok: true, authUrl };
  });

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_accounts")
      .select("email, updated_at")
      .eq("user_id", context.userId)
      .eq("provider", "gmail_oauth")
      .maybeSingle();
    if (data?.email) {
      return {
        connected: true,
        email: data.email as string,
        updatedAt: (data.updated_at as string) ?? null,
      };
    }
    return {
      connected: false,
      email: (context.claims as any)?.email ?? null,
      updatedAt: null as string | null,
    };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("email_accounts")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "gmail_oauth");
    return { ok: true };
  });

// Cache-first list: reads from public.emails. If the cache is empty for
// this user/folder, runs an initial sync. Use syncFolderFn to refresh.
export const listMessagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; folder: "inbox" | "sent"; search?: string }) =>
    z.object({
      targetUserId: z.string().uuid(),
      folder: folderSchema,
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    const { readCachedList, syncFolder } = await import("./email-sync.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check whether Gmail is connected at all (so UI can show connect screen).
    const { data: acc } = await supabaseAdmin
      .from("email_accounts")
      .select("id")
      .eq("user_id", data.targetUserId)
      .eq("provider", "gmail_oauth")
      .maybeSingle();
    if (!acc) {
      return {
        connected: false,
        messages: [] as any[],
        error: "Gmail não conectado. Clique em Conectar Gmail para autorizar a sua conta.",
      };
    }

    let cached = await readCachedList(data.targetUserId, data.folder, { search: data.search });
    let syncError: string | null = null;

    // First load for this folder → sync inline so the user sees something.
    if (cached.length === 0) {
      try {
        await syncFolder(data.targetUserId, data.folder);
        cached = await readCachedList(data.targetUserId, data.folder, { search: data.search });
      } catch (e: any) {
        const raw = String(e?.message ?? e ?? "");
        if (/não conectado|GOOGLE_OAUTH|refresh_token/i.test(raw)) {
          return {
            connected: false,
            messages: [] as any[],
            error: "Gmail não conectado. Clique em Conectar Gmail para autorizar a sua conta.",
          };
        }
        syncError = `Falha ao atualizar do Gmail. (${raw.slice(0, 200)})`;
      }
    }

    return { connected: true, messages: cached, error: syncError };
  });

// Force a sync from Gmail into the DB and return the refreshed cached list.
export const syncFolderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; folder: "inbox" | "sent"; search?: string }) =>
    z.object({
      targetUserId: z.string().uuid(),
      folder: folderSchema,
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    const { readCachedList, syncFolder } = await import("./email-sync.server");
    let error: string | null = null;
    try {
      await syncFolder(data.targetUserId, data.folder);
    } catch (e: any) {
      const raw = String(e?.message ?? e ?? "");
      if (/não conectado|GOOGLE_OAUTH|refresh_token/i.test(raw)) {
        return { connected: false, messages: [] as any[], error: "Gmail não conectado." };
      }
      error = `Falha ao atualizar do Gmail. (${raw.slice(0, 200)})`;
    }
    const messages = await readCachedList(data.targetUserId, data.folder, { search: data.search });
    return { connected: true, messages, error };
  });

export const fetchMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; folder: "inbox" | "sent"; uid: number; gmailId?: string }) =>
    z.object({
      targetUserId: z.string().uuid(),
      folder: folderSchema,
      uid: z.number().int().positive(),
      gmailId: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    if (!data.gmailId) throw new Error("ID da mensagem ausente.");
    const { getOrFetchMessage } = await import("./email-sync.server");
    return await getOrFetchMessage(data.targetUserId, data.gmailId);
  });

export const sendEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    targetUserId: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    inReplyTo?: string;
  }) => z.object({
    targetUserId: z.string().uuid(),
    to: z.string().min(3),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().min(1).max(500),
    body: z.string().max(200_000),
    inReplyTo: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    const { getProfile, sendMail } = await import("./gmail-api.server");
    const profile = await getProfile(data.targetUserId);
    const res = await sendMail(data.targetUserId, {
      from: profile.emailAddress,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      text: data.body,
      inReplyTo: data.inReplyTo,
    });
    if (context.userId !== data.targetUserId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("user_audit_log").insert({
        actor_id: context.userId,
        target_user_id: data.targetUserId,
        action: "email_sent_as_user",
        success: true,
        details: {
          to: data.to, cc: data.cc, subject: data.subject,
          messageId: res.messageId, inReplyTo: data.inReplyTo ?? null,
        },
      } as any);
    }
    return { ok: true, messageId: res.messageId };
  });

export const markReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; uid: number; gmailId?: string }) =>
    z.object({
      targetUserId: z.string().uuid(),
      uid: z.number().int().positive(),
      gmailId: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    if (!data.gmailId) return { ok: false };
    const { markRead } = await import("./gmail-api.server");
    await markRead(data.targetUserId, data.gmailId);
    return { ok: true };
  });
