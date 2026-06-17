import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function loadAccount(targetUserId: string): Promise<{ email: string; password: string; accountId: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptPassword } = await import("./email.server");
  const { data } = await supabaseAdmin
    .from("email_accounts")
    .select("id,email,password_encrypted")
    .eq("user_id", targetUserId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (!data) return null;
  try {
    const password = decryptPassword(data.password_encrypted as any);
    return { accountId: data.id as string, email: data.email as string, password };
  } catch {
    // Stale ciphertext (encryption key changed/missing). Drop it so the user can reconnect.
    await supabaseAdmin.from("email_accounts").delete().eq("id", data.id);
    return null;
  }
}

export const connectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string }) => z.object({ password: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, claims, supabase } = context;
    const email = (claims as any)?.email as string | undefined;
    if (!email) throw new Error("Email do usuário não disponível.");
    const { testGmailCredentials, encryptPassword, gmailDefaults } = await import("./email.server");
    const password = data.password.replace(/\s+/g, "");
    try {
      await testGmailCredentials(email, password);
    } catch (e: any) {
      throw new Error("Falha ao validar credenciais Gmail: " + (e?.message ?? "erro desconhecido"));
    }
    const enc = encryptPassword(password);
    // bytea must be sent as PostgreSQL hex literal ("\x...") via PostgREST,
    // otherwise a raw Buffer is JSON-serialized into garbage and decrypt fails later.
    const encHex = "\\x" + Buffer.from(enc).toString("hex");
    const defaults = gmailDefaults();
    const payload = {
      user_id: userId,
      provider: "gmail",
      email,
      display_name: (claims as any)?.user_metadata?.full_name ?? null,
      username: email,
      password_encrypted: encHex as any,
      ...defaults,
    };
    // delete then insert to avoid unique-constraint complications
    await supabase.from("email_accounts").delete().eq("user_id", userId);
    const { error } = await supabase.from("email_accounts").insert(payload as any);
    if (error) throw new Error(error.message);
    // Sanity check: try to load it back (decrypt) so we fail fast if something is off.
    const verify = await loadAccount(userId);
    if (!verify) throw new Error("Conta salva mas não pôde ser lida de volta. Tente novamente.");
    return { ok: true, email };
  });

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data } = await supabase
      .from("email_accounts")
      .select("email,updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    let connected = !!data;
    if (connected) {
      // Validate that the stored password can still be decrypted; otherwise loadAccount drops it.
      const acc = await loadAccount(userId);
      connected = !!acc;
    }
    return {
      connected,
      email: data?.email ?? (claims as any)?.email ?? null,
      updatedAt: data?.updated_at ?? null,
    };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("email_accounts").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
    const acc = await loadAccount(data.targetUserId);
    if (!acc) return { connected: false, messages: [] as any[], error: null as string | null };
    const { listMessages } = await import("./email.server");
    try {
      const messages = await listMessages(acc.email, acc.password, data.folder, { search: data.search });
      return { connected: true, messages, error: null as string | null };
    } catch (e: any) {
      const raw = String(e?.message ?? e ?? "");
      let friendly = "Falha ao acessar a caixa no Gmail.";
      if (/AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted|BadCredentials/i.test(raw)) {
        friendly = "Credenciais rejeitadas pelo Gmail. Gere uma nova senha de app e reconecte.";
      } else if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|timeout/i.test(raw)) {
        friendly = "Não foi possível conectar ao Gmail (rede/IMAP). Tente novamente.";
      } else if (/IMAP|imap\.gmail/i.test(raw)) {
        friendly = "IMAP do Gmail indisponível ou desabilitado para esta conta.";
      }
      return { connected: true, messages: [] as any[], error: `${friendly} (${raw.slice(0, 200)})` };
    }
  });

export const fetchMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; folder: "inbox" | "sent"; uid: number }) =>
    z.object({
      targetUserId: z.string().uuid(),
      folder: folderSchema,
      uid: z.number().int().positive(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    const acc = await loadAccount(data.targetUserId);
    if (!acc) throw new Error("Conta não conectada.");
    const { fetchMessage } = await import("./email.server");
    return await fetchMessage(acc.email, acc.password, data.folder, data.uid);
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
    const acc = await loadAccount(data.targetUserId);
    if (!acc) throw new Error("Conta de email do usuário não conectada.");
    const { sendMail } = await import("./email.server");
    const res = await sendMail(acc.email, acc.password, {
      to: data.to, cc: data.cc, bcc: data.bcc,
      subject: data.subject, text: data.body, inReplyTo: data.inReplyTo,
    });
    // Audit when manager sends on behalf
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
  .inputValidator((d: { targetUserId: string; uid: number }) =>
    z.object({ targetUserId: z.string().uuid(), uid: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await authorize(context.supabase, context.userId, data.targetUserId);
    if (!ok) throw new Response("Forbidden", { status: 403 });
    const acc = await loadAccount(data.targetUserId);
    if (!acc) return { ok: false };
    const { markRead } = await import("./email.server");
    await markRead(acc.email, acc.password, data.uid);
    return { ok: true };
  });
