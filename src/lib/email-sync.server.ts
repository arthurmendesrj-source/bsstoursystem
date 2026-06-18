// Email cache & sync helpers (server-only).
// Persists Gmail messages to public.emails so reads are instant and survive
// transient Gmail/network failures.
import { listMessages, fetchMessage, type FolderKind } from "./gmail-api.server";

function parseAddress(raw: string | null | undefined): { email: string | null; name: string | null } {
  if (!raw) return { email: null, name: null };
  const s = String(raw).trim();
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() || null };
  if (s.includes("@")) return { email: s.toLowerCase(), name: null };
  return { email: null, name: s };
}

function splitAddresses(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;]/)
    .map((p) => parseAddress(p).email)
    .filter((x): x is string => !!x);
}

export type CachedEmail = {
  uid: number;
  gmailId: string;
  threadId: string | null;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  preview: string;
  unread: boolean;
};

export async function readCachedList(userId: string, folder: FolderKind, opts: { search?: string; limit?: number } = {}): Promise<CachedEmail[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = Math.min(opts.limit ?? 50, 200);
  let q = supabaseAdmin
    .from("emails")
    .select("gmail_id, thread_id, from_email, from_name, to_emails, subject, snippet, internal_date, is_unread")
    .eq("user_id", userId)
    .eq("folder", folder)
    .order("internal_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  const term = opts.search?.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    q = q.or(
      `subject.ilike.${like},snippet.ilike.${like},from_email.ilike.${like},from_name.ilike.${like}`,
    );
  }
  const { data, error } = await q;
  if (error) throw new Error(`Erro lendo cache de emails: ${error.message}`);
  return (data ?? []).map((r: any) => {
    const fromName = r.from_name as string | null;
    const fromEmail = r.from_email as string | null;
    const fromCombined = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromName || fromEmail || "";
    const toCombined = Array.isArray(r.to_emails) ? (r.to_emails as string[]).join(", ") : "";
    const num = (() => {
      const s: string = r.gmail_id ?? "";
      const tail = s.slice(-12);
      const n = Number.parseInt(tail, 16);
      return Number.isFinite(n) ? n : 0;
    })();
    return {
      uid: num,
      gmailId: r.gmail_id as string,
      threadId: (r.thread_id as string | null) ?? null,
      from: fromCombined,
      to: toCombined,
      subject: (r.subject as string | null) ?? "",
      date: (r.internal_date as string | null) ?? null,
      preview: (r.snippet as string | null) ?? "",
      unread: Boolean(r.is_unread),
    };
  });
}

/** Sync latest 50 messages from Gmail for a given folder into the DB. */
export async function syncFolder(userId: string, folder: FolderKind): Promise<{ synced: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const summaries = await listMessages(userId, folder, { limit: 50 });
  if (summaries.length === 0) {
    await supabaseAdmin.from("email_sync_state").upsert({
      user_id: userId,
      folder,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    } as any, { onConflict: "user_id,folder" });
    return { synced: 0 };
  }
  const rows = summaries.map((m) => {
    const { email: fromEmail, name: fromName } = parseAddress(m.from);
    return {
      user_id: userId,
      folder,
      gmail_id: m.gmailId,
      thread_id: null as string | null,
      from_email: fromEmail,
      from_name: fromName,
      to_emails: splitAddresses(m.to),
      subject: m.subject ?? "",
      snippet: m.preview ?? "",
      internal_date: m.date,
      is_unread: !!m.unread,
    };
  });
  const { error } = await supabaseAdmin
    .from("emails")
    .upsert(rows as any, { onConflict: "user_id,gmail_id" });
  if (error) {
    await supabaseAdmin.from("email_sync_state").upsert({
      user_id: userId,
      folder,
      last_synced_at: new Date().toISOString(),
      last_error: error.message,
    } as any, { onConflict: "user_id,folder" });
    throw new Error(`Falha salvando emails: ${error.message}`);
  }
  await supabaseAdmin.from("email_sync_state").upsert({
    user_id: userId,
    folder,
    last_synced_at: new Date().toISOString(),
    last_error: null,
  } as any, { onConflict: "user_id,folder" });
  return { synced: rows.length };
}

/** Fetch full message; load from cache if already persisted, otherwise pull from Gmail and persist. */
export async function getOrFetchMessage(userId: string, gmailId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("emails")
    .select("gmail_id, thread_id, from_email, from_name, to_emails, cc_emails, subject, body_text, body_html, internal_date, body_loaded")
    .eq("user_id", userId)
    .eq("gmail_id", gmailId)
    .maybeSingle();

  if (cached?.body_loaded) {
    const fromCombined =
      (cached.from_name && cached.from_email) ? `${cached.from_name} <${cached.from_email}>` :
      cached.from_name || cached.from_email || "";
    const tail = (cached.gmail_id as string).slice(-12);
    const num = Number.parseInt(tail, 16);
    return {
      uid: Number.isFinite(num) ? num : 0,
      gmailId: cached.gmail_id as string,
      from: fromCombined,
      to: Array.isArray(cached.to_emails) ? (cached.to_emails as string[]).join(", ") : "",
      cc: Array.isArray(cached.cc_emails) ? (cached.cc_emails as string[]).join(", ") : "",
      subject: (cached.subject as string | null) ?? "",
      date: (cached.internal_date as string | null) ?? null,
      text: (cached.body_text as string | null) ?? "",
      html: (cached.body_html as string | null) ?? null,
      messageId: null as string | null,
    };
  }

  const full = await fetchMessage(userId, gmailId);
  if (!full) return null;
  const { email: fromEmail, name: fromName } = parseAddress(full.from);
  await supabaseAdmin
    .from("emails")
    .upsert({
      user_id: userId,
      folder: "inbox",
      gmail_id: full.gmailId,
      message_id: full.messageId,
      from_email: fromEmail,
      from_name: fromName,
      to_emails: splitAddresses(full.to),
      cc_emails: splitAddresses(full.cc),
      subject: full.subject,
      body_text: full.text,
      body_html: full.html,
      internal_date: full.date,
      body_loaded: true,
      is_unread: false,
    } as any, { onConflict: "user_id,gmail_id" });
  return full;
}

export async function persistSentMessage(userId: string, params: {
  gmailId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string | null;
  messageId?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { email: fromEmail, name: fromName } = parseAddress(params.from);
  await supabaseAdmin.from("emails").upsert({
    user_id: userId,
    folder: "sent",
    gmail_id: params.gmailId || `local-${crypto.randomUUID()}`,
    message_id: params.messageId ?? null,
    from_email: fromEmail,
    from_name: fromName,
    to_emails: splitAddresses(params.to),
    cc_emails: splitAddresses(params.cc),
    subject: params.subject,
    snippet: (params.text ?? "").slice(0, 200),
    body_text: params.text,
    body_html: params.html ?? null,
    internal_date: new Date().toISOString(),
    is_unread: false,
    body_loaded: true,
  } as any, { onConflict: "user_id,gmail_id" });
}
