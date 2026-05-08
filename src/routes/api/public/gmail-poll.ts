// Public cron endpoint — pg_cron hits this every minute.
// For each linked mailbox, runs Gmail incremental sync via the connector
// gateway and writes new messages/threads through the admin client (RLS
// bypassed, owner_email always set so the data is still scoped per mailbox).
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const ATTACHMENT_BUCKET = "email-attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY_1 ?? process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY missing");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    "Content-Type": "application/json",
  };
}

async function gw(path: string): Promise<any> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${GATEWAY_URL}${path}`, { headers: authHeaders() });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (res.ok) return data;
    if ((res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      continue;
    }
    throw new Error(`Gmail API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  throw new Error("Gmail API unreachable");
}

function decodeB64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try { return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0))); } catch { return ""; }
}
function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type GmailHeader = { name: string; value: string };
type GmailPart = { partId?: string; mimeType?: string; filename?: string; headers?: GmailHeader[]; body?: { data?: string; size?: number; attachmentId?: string }; parts?: GmailPart[] };
const findHeader = (h: GmailHeader[] | undefined, n: string) => h?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;
function parseFrom(v: string | undefined) {
  if (!v) return { name: "", email: "" };
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: v.trim() };
}
function extractBody(part: GmailPart | undefined) {
  let html = "", text = "", hasAttachments = false;
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
function extractAttachments(part: GmailPart | undefined) {
  const out: Array<{ attachment_id: string; part_id?: string; filename: string; mime_type: string; size: number }> = [];
  function walk(p?: GmailPart) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({ attachment_id: p.body.attachmentId, part_id: p.partId, filename: p.filename, mime_type: p.mimeType ?? "application/octet-stream", size: p.body.size ?? 0 });
    }
    p.parts?.forEach(walk);
  }
  walk(part);
  return out;
}
const CATS = ["CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS"];
function categoryFromLabels(labels: string[]) {
  for (const c of CATS) if (labels.includes(c)) return c.replace("CATEGORY_", "");
  return null;
}

function attPath(owner: string, emailId: string, attachmentId: string, filename: string) {
  const safe = (filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${owner}/${emailId}/${attachmentId}_${safe}`;
}

async function uploadAttachment(owner: string, messageId: string, emailId: string, a: { attachment_id: string; filename: string; mime_type: string; size: number }) {
  if (a.size && a.size > MAX_ATTACHMENT_BYTES) return null;
  const path = attPath(owner, emailId, a.attachment_id, a.filename);
  const { data: existing } = await supabaseAdmin.storage.from(ATTACHMENT_BUCKET).list(`${owner}/${emailId}`, { search: `${a.attachment_id}_` });
  if (existing && existing.length > 0) return path;
  try {
    const r = await gw(`/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(a.attachment_id)}`) as { data: string; size: number };
    const bytes = b64UrlToBytes(r.data);
    const { error } = await supabaseAdmin.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, { contentType: a.mime_type || "application/octet-stream", upsert: true });
    if (error) { console.error("upload failed", error.message); return null; }
    return path;
  } catch (e) { console.error("att fetch failed", e); return null; }
}

async function fetchAndStore(owner: string, messageId: string) {
  const m = await gw(`/users/me/messages/${encodeURIComponent(messageId)}?format=full`) as any;
  const headers = m.payload?.headers;
  const from = parseFrom(findHeader(headers, "From"));
  const to = (findHeader(headers, "To") ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const subject = findHeader(headers, "Subject") ?? "";
  const dh = findHeader(headers, "Date");
  const internalDate = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : (dh ? new Date(dh).toISOString() : new Date().toISOString());
  const { html, text, hasAttachments } = extractBody(m.payload);
  const labels = m.labelIds ?? [];

  const { data: up, error } = await supabaseAdmin.from("emails").upsert({
    owner_email: owner, gmail_id: m.id, thread_id: m.threadId,
    from_email: from.email, from_name: from.name, to_emails: to, subject,
    snippet: m.snippet ?? "", body_html: html, body_text: text,
    received_at: internalDate, internal_date: internalDate, labels,
    is_unread: labels.includes("UNREAD"), is_starred: labels.includes("STARRED"), is_important: labels.includes("IMPORTANT"),
    has_attachments: hasAttachments,
    history_id: m.historyId ? Number(m.historyId) : null,
    size_estimate: m.sizeEstimate ?? null,
    category: categoryFromLabels(labels),
  }, { onConflict: "gmail_id" }).select("id").single();
  if (error) throw new Error(`upsert: ${error.message}`);

  if (hasAttachments && up?.id) {
    const atts = extractAttachments(m.payload);
    if (atts.length) {
      await supabaseAdmin.from("email_attachments").delete().eq("email_id", up.id);
      await supabaseAdmin.from("email_attachments").insert(atts.map((a) => ({ ...a, email_id: up.id, storage_path: null })));
      for (const a of atts) {
        const p = await uploadAttachment(owner, m.id, up.id, a);
        if (p) await supabaseAdmin.from("email_attachments").update({ storage_path: p }).eq("email_id", up.id).eq("attachment_id", a.attachment_id);
      }
    }
  }
  return { threadId: m.threadId };
}

async function rebuildThread(owner: string, threadId: string) {
  const { data: msgs } = await supabaseAdmin.from("emails")
    .select("from_email, from_name, to_emails, subject, snippet, internal_date, labels, is_unread, is_starred, is_important, has_attachments")
    .eq("thread_id", threadId).order("internal_date", { ascending: true });
  if (!msgs || msgs.length === 0) {
    await supabaseAdmin.from("email_threads").delete().eq("id", threadId);
    return;
  }
  const participants = Array.from(new Set(msgs.flatMap((m: any) => [m.from_name || m.from_email, ...(m.to_emails ?? [])]).filter(Boolean)));
  const last = msgs[msgs.length - 1] as any;
  const allLabels = Array.from(new Set(msgs.flatMap((m: any) => m.labels ?? [])));
  await supabaseAdmin.from("email_threads").upsert({
    id: threadId, owner_email: owner,
    subject: (msgs[0] as any).subject ?? "", snippet: last.snippet ?? "",
    participants, last_message_at: last.internal_date, message_count: msgs.length,
    is_unread: msgs.some((m: any) => m.is_unread), is_starred: msgs.some((m: any) => m.is_starred),
    is_important: msgs.some((m: any) => m.is_important), has_attachments: msgs.some((m: any) => m.has_attachments),
    labels: allLabels, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

const SYNC_LABELS = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"] as const;
type SyncLabel = typeof SYNC_LABELS[number];

async function runFullSyncRound(owner: string, windowDays = 180) {
  const profile = await gw(`/users/me/profile`) as { emailAddress: string; historyId?: string };
  if (profile.emailAddress.toLowerCase() !== owner) {
    return { skipped: true, reason: `connector account mismatch` };
  }

  const { data: state } = await supabaseAdmin
    .from("email_sync_state")
    .select("full_sync_page_token, full_sync_total_synced, full_sync_started_at, full_sync_current_label")
    .eq("owner_email", owner)
    .maybeSingle();
  const s = state as any;

  let currentLabel: SyncLabel = (s?.full_sync_current_label as SyncLabel) ?? "INBOX";
  if (!SYNC_LABELS.includes(currentLabel)) currentLabel = "INBOX";
  const pageToken: string | undefined = s?.full_sync_page_token ?? undefined;
  let totalSynced: number = s?.full_sync_total_synced ?? 0;
  const startedAt = s?.full_sync_started_at ?? new Date().toISOString();

  const params = new URLSearchParams();
  params.set("maxResults", "75");
  params.set("labelIds", currentLabel);
  params.set("q", `newer_than:${windowDays}d`);
  if (currentLabel === "SPAM" || currentLabel === "TRASH") params.set("includeSpamTrash", "true");
  if (pageToken) params.set("pageToken", pageToken);

  const list = await gw(`/users/me/messages?${params.toString()}`) as { messages?: { id: string }[]; nextPageToken?: string };
  const ids = (list.messages ?? []).map((m) => m.id);
  const nextPageToken = list.nextPageToken;

  const threadIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (id) => {
      try { return await fetchAndStore(owner, id); } catch (e) { console.error("fullsync msg", id, e); return null; }
    }));
    results.forEach((r) => { if (r?.threadId) threadIds.add(r.threadId); });
  }
  for (const tid of threadIds) await rebuildThread(owner, tid);

  totalSynced += ids.length;
  const idx = SYNC_LABELS.indexOf(currentLabel);
  const nextLabel: SyncLabel | null = nextPageToken
    ? currentLabel
    : (idx < SYNC_LABELS.length - 1 ? SYNC_LABELS[idx + 1] : null);
  const done = !nextPageToken && nextLabel === null;

  await supabaseAdmin.from("email_sync_state").upsert({
    owner_email: owner,
    last_history_id: profile.historyId ? Number(profile.historyId) : null,
    last_full_sync_at: done ? new Date().toISOString() : null,
    last_incremental_sync_at: new Date().toISOString(),
    full_sync_page_token: nextPageToken ?? null,
    full_sync_current_label: done ? null : nextLabel,
    full_sync_in_progress: !done,
    full_sync_started_at: done ? null : startedAt,
    full_sync_total_synced: done ? 0 : totalSynced,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email" });

  return { fullSync: true, label: currentLabel, syncedThisRun: ids.length, totalSynced, threads: threadIds.size, done };
}

async function syncOwner(owner: string) {
  const profile = await gw(`/users/me/profile`) as { emailAddress: string; historyId?: string };
  const remoteOwner = profile.emailAddress.toLowerCase();
  if (remoteOwner !== owner) {
    return { skipped: true, reason: `connector account is ${remoteOwner}, mailbox is ${owner}` };
  }

  const { data: state } = await supabaseAdmin.from("email_sync_state").select("last_history_id, full_sync_in_progress").eq("owner_email", owner).maybeSingle();
  const s = state as any;
  if (!s?.last_history_id || s?.full_sync_in_progress) {
    return await runFullSyncRound(owner);
  }

  const params = new URLSearchParams();
  params.set("startHistoryId", String((state as any).last_history_id));
  params.set("maxResults", "500");

  let pageToken: string | undefined;
  const added = new Set<string>();
  const deleted = new Set<string>();
  const labelChanged = new Set<string>();
  let latest = Number((state as any).last_history_id);

  do {
    if (pageToken) params.set("pageToken", pageToken); else params.delete("pageToken");
    let res: any;
    try { res = await gw(`/users/me/history?${params.toString()}`); }
    catch (e: any) {
      if (String(e.message || "").includes("404")) return { needsFullSync: true };
      throw e;
    }
    const history = (res?.history ?? []) as any[];
    for (const h of history) {
      latest = Math.max(latest, Number(h.id));
      h.messagesAdded?.forEach((x: any) => added.add(x.message.id));
      h.messagesDeleted?.forEach((x: any) => deleted.add(x.message.id));
      h.labelsAdded?.forEach((x: any) => labelChanged.add(x.message.id));
      h.labelsRemoved?.forEach((x: any) => labelChanged.add(x.message.id));
    }
    pageToken = res?.nextPageToken;
  } while (pageToken);

  const toFetch = new Set<string>([...added, ...labelChanged]);
  deleted.forEach((id) => toFetch.delete(id));

  const threadIds = new Set<string>();
  const arr = Array.from(toFetch);
  for (let i = 0; i < arr.length; i += 5) {
    const batch = arr.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (id) => {
      try { return await fetchAndStore(owner, id); } catch (e) { console.error("inc msg", id, e); return null; }
    }));
    results.forEach((r) => { if (r?.threadId) threadIds.add(r.threadId); });
  }

  if (deleted.size) {
    const arrDel = Array.from(deleted);
    const { data: delRows } = await supabaseAdmin.from("emails").select("thread_id").in("gmail_id", arrDel);
    (delRows ?? []).forEach((r: any) => { if (r.thread_id) threadIds.add(r.thread_id); });
    await supabaseAdmin.from("emails").delete().in("gmail_id", arrDel);
  }

  for (const tid of threadIds) await rebuildThread(owner, tid);

  await supabaseAdmin.from("email_sync_state").upsert({
    owner_email: owner,
    last_history_id: latest,
    last_incremental_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email" });

  return { added: added.size, deleted: deleted.size, labelChanged: labelChanged.size, threads: threadIds.size, latest };
}

export const Route = createFileRoute("/api/public/gmail-poll")({
  server: {
    handlers: {
      POST: async () => {
        const { data: accounts } = await supabaseAdmin
          .from("user_email_accounts")
          .select("email_address");
        const owners = Array.from(new Set(((accounts ?? []) as any[]).map((a) => a.email_address.toLowerCase())));
        const results: Record<string, any> = {};
        for (const o of owners) {
          try { results[o] = await syncOwner(o); }
          catch (e: any) { results[o] = { error: e?.message ?? String(e) }; }
        }
        return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
      },
      GET: async () => new Response("gmail-poll ready"),
    },
  },
});
