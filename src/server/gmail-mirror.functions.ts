// Gmail mirror server functions: labels, threads, full + incremental sync, attachments.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY_1 ?? process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    "Content-Type": "application/json",
  };
}

async function gw(path: string, init?: RequestInit) {
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${GATEWAY_URL}${path}`, {
        ...init,
        headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
      });
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, 400 * attempt)); continue; }
      throw e;
    }
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (res.ok) return data as any;
    // Retry on transient upstream errors
    if ((res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      lastErr = new Error(`Gmail API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
      continue;
    }
    throw new Error(`Gmail API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gmail API: unknown error");
}

function decodeB64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

function findHeader(h: GmailHeader[] | undefined, name: string): string | undefined {
  return h?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractBody(part: GmailPart | undefined): { html: string; text: string; hasAttachments: boolean } {
  let html = ""; let text = ""; let hasAttachments = false;
  function walk(p?: GmailPart) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) hasAttachments = true;
    if (p.mimeType === "text/html" && p.body?.data) html += decodeB64Url(p.body.data);
    else if (p.mimeType === "text/plain" && p.body?.data) text += decodeB64Url(p.body.data);
    p.parts?.forEach(walk);
  }
  walk(part);
  return { html, text, hasAttachments };
}

function extractAttachments(part: GmailPart | undefined): Array<{ attachment_id: string; part_id?: string; filename: string; mime_type: string; size: number }> {
  const out: Array<{ attachment_id: string; part_id?: string; filename: string; mime_type: string; size: number }> = [];
  function walk(p?: GmailPart) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({
        attachment_id: p.body.attachmentId,
        part_id: p.partId,
        filename: p.filename,
        mime_type: p.mimeType ?? "application/octet-stream",
        size: p.body.size ?? 0,
      });
    }
    p.parts?.forEach(walk);
  }
  walk(part);
  return out;
}

function parseFrom(v: string | undefined): { name: string; email: string } {
  if (!v) return { name: "", email: "" };
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: v.trim() };
}

const CATEGORY_LABELS = ["CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS"];

function categoryFromLabels(labels: string[]): string | null {
  for (const c of CATEGORY_LABELS) if (labels.includes(c)) return c.replace("CATEGORY_", "");
  return null;
}

// ---------------- LABELS ----------------
export const gmailListLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // who am i (owner email)
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();

    const list = (await gw(`/users/me/labels`)) as { labels: Array<{ id: string; name: string; type: string; messageListVisibility?: string; labelListVisibility?: string }> };

    // get details (counts/colors) per label in parallel (batched)
    const details = await Promise.all(
      list.labels.map(async (l) => {
        try {
          return (await gw(`/users/me/labels/${encodeURIComponent(l.id)}`)) as {
            id: string; name: string; type: string;
            messagesTotal?: number; messagesUnread?: number;
            color?: { backgroundColor?: string; textColor?: string };
            messageListVisibility?: string; labelListVisibility?: string;
          };
        } catch { return null; }
      }),
    );

    const rows = details.filter(Boolean).map((d) => ({
      id: d!.id,
      owner_email: owner,
      name: d!.name,
      type: d!.type,
      color_bg: d!.color?.backgroundColor ?? null,
      color_text: d!.color?.textColor ?? null,
      unread_count: d!.messagesUnread ?? 0,
      total_count: d!.messagesTotal ?? 0,
      message_list_visibility: d!.messageListVisibility ?? null,
      label_list_visibility: d!.labelListVisibility ?? null,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length) {
      const { error } = await supabase.from("email_labels").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`labels upsert: ${error.message}`);
    }
    return { count: rows.length, owner };
  });

// ---------------- internal: download attachment binary into Storage ----------------
const ATTACHMENT_BUCKET = "email-attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function attStoragePath(owner: string, emailId: string, attachmentId: string, filename: string): string {
  const safeName = (filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  // first segment = owner_email so storage RLS can match it
  return `${owner}/${emailId}/${attachmentId}_${safeName}`;
}

async function downloadAttachmentToStorage(
  supabase: any,
  owner: string,
  messageId: string,
  emailId: string,
  att: { attachment_id: string; filename: string; mime_type: string; size: number },
): Promise<string | null> {
  if (att.size && att.size > MAX_ATTACHMENT_BYTES) {
    console.warn(`skip large attachment ${att.filename} (${att.size} bytes)`);
    return null;
  }
  const path = attStoragePath(owner, emailId, att.attachment_id, att.filename);
  // skip if already uploaded
  const { data: existing } = await supabase.storage.from(ATTACHMENT_BUCKET).list(`${owner}/${emailId}`, { search: `${att.attachment_id}_` });
  if (existing && existing.length > 0) return path;
  try {
    const r = (await gw(`/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(att.attachment_id)}`)) as { data: string; size: number };
    const bytes = b64UrlToBytes(r.data);
    const { error: upErr } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
      contentType: att.mime_type || "application/octet-stream",
      upsert: true,
    });
    if (upErr) { console.error("attachment upload failed", path, upErr.message); return null; }
    return path;
  } catch (e) {
    console.error("attachment fetch failed", att.filename, e);
    return null;
  }
}

// ---------------- internal: fetch + persist a single message ----------------
async function fetchAndStoreMessage(supabase: any, owner: string, messageId: string) {
  const m = (await gw(`/users/me/messages/${encodeURIComponent(messageId)}?format=full`)) as {
    id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string;
    historyId?: string; sizeEstimate?: number; payload?: GmailPart;
  };
  const headers = m.payload?.headers;
  const from = parseFrom(findHeader(headers, "From"));
  const to = (findHeader(headers, "To") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const subject = findHeader(headers, "Subject") ?? "";
  const dateHeader = findHeader(headers, "Date");
  const internalDate = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString());
  const { html, text, hasAttachments } = extractBody(m.payload);
  const labels = m.labelIds ?? [];

  const row = {
    owner_email: owner,
    gmail_id: m.id,
    thread_id: m.threadId,
    from_email: from.email,
    from_name: from.name,
    to_emails: to,
    subject,
    snippet: m.snippet ?? "",
    body_html: html,
    body_text: text,
    received_at: internalDate,
    internal_date: internalDate,
    labels,
    is_unread: labels.includes("UNREAD"),
    is_starred: labels.includes("STARRED"),
    is_important: labels.includes("IMPORTANT"),
    has_attachments: hasAttachments,
    history_id: m.historyId ? Number(m.historyId) : null,
    size_estimate: m.sizeEstimate ?? null,
    category: categoryFromLabels(labels),
  };

  const { data: upserted, error } = await supabase
    .from("emails")
    .upsert(row, { onConflict: "gmail_id" })
    .select("id")
    .single();
  if (error) throw new Error(`emails upsert: ${error.message}`);

  // attachments — register metadata then download binaries to Storage
  if (hasAttachments && upserted?.id) {
    const atts = extractAttachments(m.payload);
    if (atts.length) {
      // Re-register metadata rows (idempotent: clear and reinsert per email)
      await supabase.from("email_attachments").delete().eq("email_id", upserted.id);
      const inserted = atts.map((a) => ({ ...a, email_id: upserted.id, storage_path: null as string | null }));
      await supabase.from("email_attachments").insert(inserted);
      // Download binaries
      for (const a of atts) {
        const path = await downloadAttachmentToStorage(supabase, owner, m.id, upserted.id, a);
        if (path) {
          await supabase.from("email_attachments")
            .update({ storage_path: path })
            .eq("email_id", upserted.id)
            .eq("attachment_id", a.attachment_id);
        }
      }
    }
  }

  return { id: upserted?.id, threadId: m.threadId, owner };
}

// ---------------- internal: rebuild thread aggregate ----------------
async function rebuildThread(supabase: any, owner: string, threadId: string) {
  const { data: msgs } = await supabase
    .from("emails")
    .select("from_email, from_name, to_emails, subject, snippet, internal_date, labels, is_unread, is_starred, is_important, has_attachments")
    .eq("thread_id", threadId)
    .order("internal_date", { ascending: true });

  if (!msgs || msgs.length === 0) {
    await supabase.from("email_threads").delete().eq("id", threadId);
    return;
  }

  const participants = Array.from(new Set(msgs.flatMap((m: any) => [m.from_name || m.from_email, ...(m.to_emails ?? [])]).filter(Boolean)));
  const last = msgs[msgs.length - 1];
  const allLabels = Array.from(new Set(msgs.flatMap((m: any) => m.labels ?? [])));

  await supabase.from("email_threads").upsert({
    id: threadId,
    owner_email: owner,
    subject: msgs[0].subject ?? "",
    snippet: last.snippet ?? "",
    participants,
    last_message_at: last.internal_date,
    message_count: msgs.length,
    is_unread: msgs.some((m: any) => m.is_unread),
    is_starred: msgs.some((m: any) => m.is_starred),
    is_important: msgs.some((m: any) => m.is_important),
    has_attachments: msgs.some((m: any) => m.has_attachments),
    labels: allLabels,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

// ---------------- FULL SYNC (resumable, one page per call) ----------------
// Each invocation lists ONE page of message IDs (up to 500) and fetches them.
// Progress is persisted in email_sync_state.full_sync_page_token. The UI
// re-invokes until { done: true }.
export const gmailFullSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { restart?: boolean }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string; historyId?: string };
    const owner = profile.emailAddress.toLowerCase();

    const { data: state } = await supabase
      .from("email_sync_state")
      .select("full_sync_page_token, full_sync_in_progress, full_sync_total_synced, full_sync_started_at")
      .eq("owner_email", owner)
      .maybeSingle();

    const restart = !!data.restart;
    const pageToken: string | undefined = restart ? undefined : ((state as any)?.full_sync_page_token ?? undefined);
    let totalSynced: number = restart ? 0 : ((state as any)?.full_sync_total_synced ?? 0);
    const startedAt = restart || !(state as any)?.full_sync_started_at ? new Date().toISOString() : (state as any).full_sync_started_at;

    const params = new URLSearchParams();
    params.set("maxResults", "500");
    params.set("includeSpamTrash", "true");
    if (pageToken) params.set("pageToken", pageToken);
    const list = (await gw(`/users/me/messages?${params.toString()}`)) as {
      messages?: { id: string }[]; nextPageToken?: string;
    };
    const ids = (list.messages ?? []).map((m) => m.id);
    const nextPageToken: string | undefined = list.nextPageToken;

    const threadIds = new Set<string>();
    const CONCURRENCY = 5;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (id) => {
        try { return await fetchAndStoreMessage(supabase, owner, id); }
        catch (e) { console.error("msg fail", id, e); return null; }
      }));
      results.forEach((r) => { if (r?.threadId) threadIds.add(r.threadId); });
    }

    for (const tid of threadIds) await rebuildThread(supabase, owner, tid);

    totalSynced += ids.length;
    const done = !nextPageToken;

    await supabase.from("email_sync_state").upsert({
      owner_email: owner,
      last_history_id: profile.historyId ? Number(profile.historyId) : null,
      last_full_sync_at: done ? new Date().toISOString() : null,
      last_incremental_sync_at: new Date().toISOString(),
      full_sync_page_token: done ? null : nextPageToken,
      full_sync_in_progress: !done,
      full_sync_started_at: done ? null : startedAt,
      full_sync_total_synced: done ? 0 : totalSynced,
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_email" });

    return {
      done,
      syncedThisRun: ids.length,
      totalSynced,
      threads: threadIds.size,
      owner,
      hasMore: !done,
    };
  });

// ---------------- INCREMENTAL SYNC ----------------
export const gmailIncrementalSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string; historyId?: string };
    const owner = profile.emailAddress.toLowerCase();

    const { data: state } = await supabase
      .from("email_sync_state")
      .select("last_history_id")
      .eq("owner_email", owner)
      .maybeSingle();

    if (!state?.last_history_id) {
      // No baseline — caller should run full sync first
      return { needsFullSync: true, owner };
    }

    const startId = state.last_history_id;
    const params = new URLSearchParams();
    params.set("startHistoryId", String(startId));
    params.set("maxResults", "500");

    let pageToken: string | undefined = undefined;
    const addedIds = new Set<string>();
    const deletedIds = new Set<string>();
    const labelChanged = new Map<string, Set<string>>();
    let latestHistoryId: number = Number(startId);

    do {
      if (pageToken) params.set("pageToken", pageToken); else params.delete("pageToken");
      let res: any;
      try {
        res = await gw(`/users/me/history?${params.toString()}`);
      } catch (e: any) {
        // 404 = historyId too old; trigger full sync
        if (String(e.message || "").includes("404")) return { needsFullSync: true, owner };
        throw e;
      }

      const history = (res?.history ?? []) as Array<{
        id: string;
        messagesAdded?: { message: { id: string; threadId: string } }[];
        messagesDeleted?: { message: { id: string; threadId: string } }[];
        labelsAdded?: { message: { id: string; threadId: string }; labelIds: string[] }[];
        labelsRemoved?: { message: { id: string; threadId: string }; labelIds: string[] }[];
      }>;
      for (const h of history) {
        latestHistoryId = Math.max(latestHistoryId, Number(h.id));
        h.messagesAdded?.forEach((x) => addedIds.add(x.message.id));
        h.messagesDeleted?.forEach((x) => deletedIds.add(x.message.id));
        h.labelsAdded?.forEach((x) => labelChanged.set(x.message.id, new Set(labelChanged.get(x.message.id) || [])));
        h.labelsRemoved?.forEach((x) => labelChanged.set(x.message.id, new Set(labelChanged.get(x.message.id) || [])));
      }
      pageToken = res?.nextPageToken;
    } while (pageToken);

    // Fetch added/changed
    const toFetch = new Set<string>([...addedIds, ...labelChanged.keys()]);
    deletedIds.forEach((id) => toFetch.delete(id));

    const threadIds = new Set<string>();
    const CONCURRENCY = 6;
    const arr = Array.from(toFetch);
    for (let i = 0; i < arr.length; i += CONCURRENCY) {
      const batch = arr.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (id) => {
        try { return await fetchAndStoreMessage(supabase, owner, id); }
        catch (e) { console.error("inc msg fail", id, e); return null; }
      }));
      results.forEach((r) => { if (r?.threadId) threadIds.add(r.threadId); });
    }

    // Apply deletions
    if (deletedIds.size) {
      const arrDel = Array.from(deletedIds);
      const { data: delRows } = await supabase.from("emails").select("thread_id").in("gmail_id", arrDel);
      (delRows ?? []).forEach((r: any) => { if (r.thread_id) threadIds.add(r.thread_id); });
      await supabase.from("emails").delete().in("gmail_id", arrDel);
    }

    for (const tid of threadIds) await rebuildThread(supabase, owner, tid);

    await supabase.from("email_sync_state").upsert({
      owner_email: owner,
      last_history_id: latestHistoryId,
      last_incremental_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_email" });

    return {
      added: addedIds.size,
      deleted: deletedIds.size,
      labelChanged: labelChanged.size,
      threads: threadIds.size,
      owner,
      latestHistoryId,
    };
  });

// ---------------- GET THREAD (full) ----------------
export const gmailGetThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { threadId: string }) => d)
  .handler(async ({ data }) => {
    const t = (await gw(`/users/me/threads/${encodeURIComponent(data.threadId)}?format=full`)) as {
      id: string; messages: Array<{ id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart }>;
    };
    const messages = (t.messages ?? []).map((m) => {
      const headers = m.payload?.headers;
      const from = parseFrom(findHeader(headers, "From"));
      const to = (findHeader(headers, "To") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const cc = (findHeader(headers, "Cc") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const subject = findHeader(headers, "Subject") ?? "";
      const dateHeader = findHeader(headers, "Date");
      const internalDate = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : (dateHeader ? new Date(dateHeader).toISOString() : null);
      const { html, text, hasAttachments } = extractBody(m.payload);
      const attachments = extractAttachments(m.payload);
      return {
        id: m.id,
        labelIds: m.labelIds ?? [],
        snippet: m.snippet ?? "",
        from, to, cc, subject,
        date: internalDate,
        bodyHtml: html,
        bodyText: text,
        hasAttachments,
        attachments,
        isUnread: (m.labelIds ?? []).includes("UNREAD"),
      };
    });
    return { threadId: t.id, messages };
  });

// ---------------- GET ATTACHMENT ----------------
export const gmailGetAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; attachmentId: string }) => d)
  .handler(async ({ data }) => {
    const att = (await gw(`/users/me/messages/${encodeURIComponent(data.messageId)}/attachments/${encodeURIComponent(data.attachmentId)}`)) as { data: string; size: number };
    return { dataB64Url: att.data, size: att.size };
  });
