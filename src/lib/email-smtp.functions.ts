import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProviderEnum = z.enum(["gmail", "outlook", "yahoo", "icloud", "other"]);

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  provider: ProviderEnum,
  email_address: z.string().trim().email().max(255),
  display_name: z.string().trim().max(200).optional().nullable(),
  smtp_host: z.string().trim().min(1).max(255),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_secure: z.boolean(),
  imap_host: z.string().trim().min(1).max(255),
  imap_port: z.number().int().min(1).max(65535),
  imap_secure: z.boolean(),
  auth_username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(1024),
});

const TestSchema = SaveSchema.omit({ id: true });

export const testEmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TestSchema.parse(input))
  .handler(async ({ data }) => {
    const { testSmtp, testImap } = await import("@/server/email-smtp.server");
    const cfg = {
      smtp_host: data.smtp_host, smtp_port: data.smtp_port, smtp_secure: data.smtp_secure,
      imap_host: data.imap_host, imap_port: data.imap_port, imap_secure: data.imap_secure,
      auth_username: data.auth_username, password: data.password,
    };
    const [smtp, imap] = await Promise.all([testSmtp(cfg), testImap(cfg)]);
    return { smtp, imap, ok: smtp.ok && imap.ok };
  });

export const saveEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { testSmtp, testImap } = await import("@/server/email-smtp.server");
    const { encryptSecret } = await import("@/server/whatsapp-crypto.server");

    const cfg = {
      smtp_host: data.smtp_host, smtp_port: data.smtp_port, smtp_secure: data.smtp_secure,
      imap_host: data.imap_host, imap_port: data.imap_port, imap_secure: data.imap_secure,
      auth_username: data.auth_username, password: data.password,
    };
    const [smtp, imap] = await Promise.all([testSmtp(cfg), testImap(cfg)]);
    if (!smtp.ok || !imap.ok) {
      const err = !smtp.ok ? `SMTP: ${smtp.error}` : `IMAP: ${imap.error}`;
      throw new Error(err);
    }

    const encrypted = encryptSecret(data.password);
    const payload = {
      user_id: context.userId,
      provider: data.provider,
      email_address: data.email_address,
      display_name: data.display_name ?? null,
      smtp_host: data.smtp_host, smtp_port: data.smtp_port, smtp_secure: data.smtp_secure,
      imap_host: data.imap_host, imap_port: data.imap_port, imap_secure: data.imap_secure,
      auth_username: data.auth_username,
      auth_password_encrypted: encrypted,
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
      last_test_error: null,
    };

    const { data: row, error } = await context.supabase
      .from("email_smtp_accounts")
      .upsert(payload, { onConflict: "user_id,email_address" })
      .select("id, email_address, provider, display_name")
      .single();
    if (error) throw new Error(error.message);
    return { account: row };
  });

export const listEmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_smtp_accounts")
      .select("id, provider, email_address, display_name, smtp_host, smtp_port, imap_host, imap_port, last_test_at, last_test_ok, last_test_error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: data ?? [] };
  });

export const deleteEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_smtp_accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SendSchema = z.object({
  accountId: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().max(998),
  text: z.string().max(200000).optional(),
  html: z.string().max(500000).optional(),
});

export const sendEmailViaSmtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { buildTransport } = await import("@/server/email-smtp.server");
    const { decryptSecret } = await import("@/server/whatsapp-crypto.server");

    const { data: acc, error } = await context.supabase
      .from("email_smtp_accounts")
      .select("*")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .single();
    if (error || !acc) throw new Error("Conta não encontrada");

    const password = decryptSecret(acc.auth_password_encrypted);
    const transport = buildTransport({
      smtp_host: acc.smtp_host, smtp_port: acc.smtp_port, smtp_secure: acc.smtp_secure,
      imap_host: acc.imap_host, imap_port: acc.imap_port, imap_secure: acc.imap_secure,
      auth_username: acc.auth_username, password,
    });
    const info = await transport.sendMail({
      from: acc.display_name ? `${acc.display_name} <${acc.email_address}>` : acc.email_address,
      to: data.to, cc: data.cc, bcc: data.bcc,
      subject: data.subject,
      text: data.text, html: data.html,
    });
    return { messageId: info.messageId };
  });

const FetchInboxSchema = z.object({
  accountId: z.string().uuid(),
  mailbox: z.string().max(200).default("INBOX"),
  limit: z.number().int().min(1).max(100).default(30),
});

export const fetchInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FetchInboxSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { buildImap } = await import("@/server/email-smtp.server");
    const { decryptSecret } = await import("@/server/whatsapp-crypto.server");

    const { data: acc, error } = await context.supabase
      .from("email_smtp_accounts")
      .select("*")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .single();
    if (error || !acc) throw new Error("Conta não encontrada");

    const password = decryptSecret(acc.auth_password_encrypted);
    const client = buildImap({
      smtp_host: acc.smtp_host, smtp_port: acc.smtp_port, smtp_secure: acc.smtp_secure,
      imap_host: acc.imap_host, imap_port: acc.imap_port, imap_secure: acc.imap_secure,
      auth_username: acc.auth_username, password,
    });

    type Msg = {
      uid: number; seq: number; subject: string; from: string;
      date: string | null; flags: string[]; preview: string;
    };
    const out: Msg[] = [];
    try {
      await client.connect();
      const lock = await client.getMailboxLock(data.mailbox);
      try {
        const mb = client.mailbox;
        if (!mb || typeof mb === "boolean") return { messages: [], total: 0 };
        const total = mb.exists ?? 0;
        const start = Math.max(1, total - data.limit + 1);
        const range = `${start}:*`;
        for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: false, source: false })) {
          const env = msg.envelope;
          out.push({
            uid: msg.uid ?? 0,
            seq: msg.seq ?? 0,
            subject: env?.subject ?? "(sem assunto)",
            from: env?.from?.[0] ? `${env.from[0].name ?? ""} <${env.from[0].address ?? ""}>`.trim() : "",
            date: (msg.internalDate ?? env?.date ?? null)?.toISOString?.() ?? null,
            flags: Array.from(msg.flags ?? []),
            preview: "",
          });
        }
        out.reverse();
        return { messages: out, total };
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* noop */ }
    }
  });

const FetchBodySchema = z.object({
  accountId: z.string().uuid(),
  mailbox: z.string().max(200).default("INBOX"),
  uid: z.number().int().positive(),
});

export const fetchEmailBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FetchBodySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { buildImap } = await import("@/server/email-smtp.server");
    const { decryptSecret } = await import("@/server/whatsapp-crypto.server");

    const { data: acc, error } = await context.supabase
      .from("email_smtp_accounts")
      .select("*")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .single();
    if (error || !acc) throw new Error("Conta não encontrada");

    const password = decryptSecret(acc.auth_password_encrypted);
    const client = buildImap({
      smtp_host: acc.smtp_host, smtp_port: acc.smtp_port, smtp_secure: acc.smtp_secure,
      imap_host: acc.imap_host, imap_port: acc.imap_port, imap_secure: acc.imap_secure,
      auth_username: acc.auth_username, password,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(data.mailbox);
      try {
        const msg = await client.fetchOne(String(data.uid), { source: true, envelope: true }, { uid: true });
        if (!msg || !msg.source) return { html: null, text: null, subject: null };
        const raw = msg.source.toString("utf8");
        return {
          subject: msg.envelope?.subject ?? null,
          raw,
          html: null as string | null,
          text: null as string | null,
        };
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* noop */ }
    }
  });

export const markEmailAsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    accountId: z.string().uuid(),
    mailbox: z.string().max(200).default("INBOX"),
    uid: z.number().int().positive(),
    read: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { buildImap } = await import("@/server/email-smtp.server");
    const { decryptSecret } = await import("@/server/whatsapp-crypto.server");

    const { data: acc, error } = await context.supabase
      .from("email_smtp_accounts").select("*")
      .eq("id", data.accountId).eq("user_id", context.userId).single();
    if (error || !acc) throw new Error("Conta não encontrada");

    const password = decryptSecret(acc.auth_password_encrypted);
    const client = buildImap({
      smtp_host: acc.smtp_host, smtp_port: acc.smtp_port, smtp_secure: acc.smtp_secure,
      imap_host: acc.imap_host, imap_port: acc.imap_port, imap_secure: acc.imap_secure,
      auth_username: acc.auth_username, password,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock(data.mailbox);
      try {
        if (data.read) await client.messageFlagsAdd(String(data.uid), ["\\Seen"], { uid: true });
        else await client.messageFlagsRemove(String(data.uid), ["\\Seen"], { uid: true });
        return { ok: true };
      } finally { lock.release(); }
    } finally {
      try { await client.logout(); } catch { /* noop */ }
    }
  });
