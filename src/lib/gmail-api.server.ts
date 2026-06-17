// Gmail HTTP API helpers (via Lovable connector gateway). Server-only.
// Replaces the IMAP/SMTP approach which is not viable on the Worker runtime.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function headers() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAIL_API_KEY =
    process.env.GOOGLE_MAIL_API_KEY_1 ?? process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("Conector Gmail não está conectado");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    "Content-Type": "application/json",
  };
}

async function gw<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as any) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return null as any;
  }
}

export async function getProfile(): Promise<{ emailAddress: string }> {
  return await gw<{ emailAddress: string }>("/users/me/profile");
}

function decodeBase64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function toBase64Url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hdr(headers: any[] | undefined, name: string): string {
  if (!headers) return "";
  const h = headers.find((x) => (x?.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
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
  gmailId: string;
};

export type FolderKind = "inbox" | "sent";

export async function listMessages(
  kind: FolderKind,
  opts: { limit?: number; search?: string } = {},
): Promise<MessageSummary[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const labelId = kind === "inbox" ? "INBOX" : "SENT";
  const params = new URLSearchParams({
    maxResults: String(limit),
    labelIds: labelId,
  });
  if (opts.search?.trim()) params.set("q", opts.search.trim());
  const list = await gw<{ messages?: { id: string }[] }>(
    `/users/me/messages?${params.toString()}`,
  );
  const ids = list?.messages ?? [];
  if (ids.length === 0) return [];
  const out: MessageSummary[] = [];
  // Fetch metadata in parallel batches to keep latency bounded.
  const batchSize = 10;
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map((m) =>
        gw<any>(
          `/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        ).catch(() => null),
      ),
    );
    results.forEach((msg, idx) => {
      if (!msg) return;
      const headers = msg.payload?.headers as any[] | undefined;
      const numericId = Number.parseInt(msg.id.slice(-12), 16);
      out.push({
        uid: numericId,
        seq: i + idx,
        gmailId: msg.id,
        from: hdr(headers, "From"),
        to: hdr(headers, "To"),
        subject: hdr(headers, "Subject"),
        date: msg.internalDate
          ? new Date(Number(msg.internalDate)).toISOString()
          : null,
        preview: msg.snippet ?? "",
        unread: Array.isArray(msg.labelIds) ? msg.labelIds.includes("UNREAD") : false,
      });
    });
  }
  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export type MessageFull = {
  uid: number;
  gmailId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  text: string;
  html: string | null;
  messageId: string | null;
};

function walkParts(payload: any): { text: string; html: string | null } {
  let text = "";
  let html: string | null = null;
  const visit = (p: any) => {
    if (!p) return;
    const mime: string = p.mimeType ?? "";
    const data: string | undefined = p.body?.data;
    if (data) {
      const decoded = decodeBase64Url(data).toString("utf8");
      if (mime === "text/plain" && !text) text = decoded;
      else if (mime === "text/html" && !html) html = decoded;
    }
    if (Array.isArray(p.parts)) p.parts.forEach(visit);
  };
  visit(payload);
  return { text, html };
}

export async function fetchMessage(gmailId: string): Promise<MessageFull | null> {
  const msg = await gw<any>(`/users/me/messages/${gmailId}?format=full`).catch(() => null);
  if (!msg) return null;
  const headers = msg.payload?.headers as any[] | undefined;
  const { text, html } = walkParts(msg.payload);
  const numericId = Number.parseInt(msg.id.slice(-12), 16);
  // Mark as read (best effort)
  try {
    await gw(`/users/me/messages/${gmailId}/modify`, {
      method: "POST",
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });
  } catch {}
  return {
    uid: numericId,
    gmailId: msg.id,
    from: hdr(headers, "From"),
    to: hdr(headers, "To"),
    cc: hdr(headers, "Cc"),
    subject: hdr(headers, "Subject"),
    date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
    text,
    html,
    messageId: hdr(headers, "Message-ID") || null,
  };
}

export async function markRead(gmailId: string): Promise<void> {
  await gw(`/users/me/messages/${gmailId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

function buildMime(opts: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
}): string {
  const lines: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    opts.bcc ? `Bcc: ${opts.bcc}` : "",
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : "",
    opts.inReplyTo ? `References: ${opts.inReplyTo}` : "",
  ].filter(Boolean);
  if (opts.html) {
    const boundary = `=_b_${Math.random().toString(36).slice(2)}`;
    lines.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.text,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.html,
      "",
      `--${boundary}--`,
      "",
    );
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"', "", opts.text);
  }
  return lines.join("\r\n");
}

export async function sendMail(opts: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
}): Promise<{ messageId: string }> {
  const raw = toBase64Url(buildMime(opts));
  const res = await gw<{ id?: string }>("/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  return { messageId: res?.id ?? "" };
}
