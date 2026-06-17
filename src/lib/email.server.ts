// Server-only Gmail IMAP/SMTP helpers. Never import from client code.
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const GMAIL_IMAP = { host: "imap.gmail.com", port: 993, secure: true };
const GMAIL_SMTP = { host: "smtp.gmail.com", port: 465, secure: true };

function getKey(): Buffer {
  const k = process.env.EMAIL_ENCRYPTION_KEY;
  if (!k || k.length < 16) throw new Error("EMAIL_ENCRYPTION_KEY is not configured");
  // derive 32-byte key from the secret (any length input)
  return createHash("sha256").update(k).digest();
}

// Format: <12-byte IV><16-byte tag><ciphertext> stored as bytea
export function encryptPassword(plain: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decryptPassword(blob: Buffer | Uint8Array | string): string {
  let buf: Buffer;
  if (typeof blob === "string") {
    // bytea returned as \x... hex
    const hex = blob.startsWith("\\x") ? blob.slice(2) : blob;
    buf = Buffer.from(hex, "hex");
  } else {
    buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout (${label}) após ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function testGmailCredentials(email: string, appPassword: string) {
  // SMTP verify
  const transporter = nodemailer.createTransport({
    ...GMAIL_SMTP,
    auth: { user: email, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  } as any);
  await withTimeout(transporter.verify(), 15_000, "SMTP verify");

  // IMAP connect
  const client = new ImapFlow({
    ...GMAIL_IMAP,
    auth: { user: email, pass: appPassword },
    logger: false,
  });
  try {
    await withTimeout(client.connect(), 15_000, "IMAP connect");
  } finally {
    try { await client.logout(); } catch {}
  }
}

export function gmailDefaults() {
  return {
    smtp_host: GMAIL_SMTP.host,
    smtp_port: GMAIL_SMTP.port,
    smtp_secure: GMAIL_SMTP.secure,
    imap_host: GMAIL_IMAP.host,
    imap_port: GMAIL_IMAP.port,
    imap_secure: GMAIL_IMAP.secure,
  };
}

export type MessageSummary = {
  uid: number;
  seq: number;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  preview: string;
  unread: boolean;
};

export type FolderKind = "inbox" | "sent";

async function resolveFolderPath(client: ImapFlow, kind: FolderKind): Promise<string> {
  if (kind === "inbox") return "INBOX";
  // Look for \Sent special-use
  const list = await client.list();
  const sent = list.find((m: any) => Array.isArray(m.specialUse) ? m.specialUse.includes("\\Sent") : m.specialUse === "\\Sent");
  if (sent) return sent.path;
  // Fallbacks
  const candidates = ["[Gmail]/Sent Mail", "[Gmail]/E-mails enviados", "[Google Mail]/Sent Mail", "Sent"];
  for (const c of candidates) {
    if (list.find((m: any) => m.path === c)) return c;
  }
  return "[Gmail]/Sent Mail";
}

function makeImap(email: string, appPassword: string) {
  return new ImapFlow({
    ...GMAIL_IMAP,
    auth: { user: email, pass: appPassword },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
  } as any);
}

export async function listMessages(
  email: string,
  appPassword: string,
  kind: FolderKind,
  opts: { limit?: number; search?: string } = {},
): Promise<MessageSummary[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const client = makeImap(email, appPassword);
  await withTimeout(client.connect(), 20_000, "IMAP connect");
  try {
    const path = await withTimeout(resolveFolderPath(client, kind), 15_000, "IMAP list folders");
    const lock = await withTimeout(client.getMailboxLock(path), 15_000, "IMAP lock mailbox");
    try {
      const status = await withTimeout(client.status(path, { messages: true }), 15_000, "IMAP status");
      const total = status.messages ?? 0;
      if (total === 0) return [];
      const from = Math.max(1, total - limit + 1);
      const range = `${from}:${total}`;
      const out: MessageSummary[] = [];
      const fetchLoop = (async () => {
        for await (const msg of client.fetch(range, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: false,
          source: false,
        })) {
          const env = msg.envelope as any;
          const fromAddr = env?.from?.[0];
          const toAddr = env?.to?.[0];
          out.push({
            uid: msg.uid as number,
            seq: msg.seq as number,
            from: fromAddr ? `${fromAddr.name ?? ""} <${fromAddr.address ?? ""}>`.trim() : "",
            to: toAddr ? `${toAddr.name ?? ""} <${toAddr.address ?? ""}>`.trim() : "",
            subject: env?.subject ?? "",
            date: env?.date ? new Date(env.date).toISOString() : null,
            preview: "",
            unread: !((msg.flags as Set<string> | undefined)?.has("\\Seen")),
          });
        }
      })();
      await withTimeout(fetchLoop, 30_000, "IMAP fetch list");
      const q = (opts.search ?? "").trim().toLowerCase();
      const filtered = q
        ? out.filter(
            (m) =>
              m.subject.toLowerCase().includes(q) ||
              m.from.toLowerCase().includes(q) ||
              m.to.toLowerCase().includes(q),
          )
        : out;
      return filtered.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    } finally {
      lock.release();
    }
  } finally {
    try { await withTimeout(client.logout(), 5_000, "IMAP logout"); } catch {}
  }
}

export type MessageFull = {
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  text: string;
  html: string | null;
  messageId: string | null;
};

export async function fetchMessage(
  email: string,
  appPassword: string,
  kind: FolderKind,
  uid: number,
): Promise<MessageFull | null> {
  const client = makeImap(email, appPassword);
  await withTimeout(client.connect(), 20_000, "IMAP connect");
  try {
    const path = await withTimeout(resolveFolderPath(client, kind), 15_000, "IMAP list folders");
    const lock = await withTimeout(client.getMailboxLock(path), 15_000, "IMAP lock mailbox");
    try {
      const msg = await withTimeout(
        client.fetchOne(String(uid), { uid: true, source: true, envelope: true }, { uid: true }),
        30_000,
        "IMAP fetch message",
      );
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source as Buffer);
      if (kind === "inbox") {
        try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); } catch {}
      }
      return {
        uid,
        from: parsed.from?.text ?? "",
        to: (parsed.to as any)?.text ?? "",
        cc: (parsed.cc as any)?.text ?? "",
        subject: parsed.subject ?? "",
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text ?? "",
        html: typeof parsed.html === "string" ? parsed.html : null,
        messageId: parsed.messageId ?? null,
      };
    } finally {
      lock.release();
    }
  } finally {
    try { await withTimeout(client.logout(), 5_000, "IMAP logout"); } catch {}
  }
}

export async function sendMail(
  email: string,
  appPassword: string,
  opts: { to: string; cc?: string; bcc?: string; subject: string; text: string; html?: string; inReplyTo?: string },
): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    ...GMAIL_SMTP,
    auth: { user: email, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  } as any);
  const info = await withTimeout(
    transporter.sendMail({
      from: email,
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      inReplyTo: opts.inReplyTo,
      references: opts.inReplyTo,
    }),
    30_000,
    "SMTP send",
  );
  return { messageId: info.messageId };
}

export async function markRead(email: string, appPassword: string, uid: number) {
  const client = makeImap(email, appPassword);
  await withTimeout(client.connect(), 20_000, "IMAP connect");
  try {
    const lock = await withTimeout(client.getMailboxLock("INBOX"), 15_000, "IMAP lock mailbox");
    try {
      await withTimeout(
        client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }),
        15_000,
        "IMAP mark read",
      );
    } finally {
      lock.release();
    }
  } finally {
    try { await withTimeout(client.logout(), 5_000, "IMAP logout"); } catch {}
  }
}
