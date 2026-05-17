// Server-only Gmail mirror helpers. Used by both protected server fns
// (with the user-scoped supabase client) and the public cron route
// (with supabaseAdmin). No middleware here — caller passes the client.
//
// All Gmail API calls now go through `gmailFetch` which uses per-user OAuth
// tokens stored in `user_gmail_tokens`. The active account is selected via
// AsyncLocalStorage (see gmail-auth.server.ts) — callers must wrap calls in
// `runWithGmailAccount({ userId, emailAddress }, ...)`.
import type { SupabaseClient } from "@supabase/supabase-js";
import { gmailFetch } from "@/server/gmail-auth.server";

export async function gw(path: string, init?: RequestInit) {
  return gmailFetch(path, init);
}


function decodeB64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0)));
  } catch { return ""; }
}

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

export function findHeader(h: GmailHeader[] | undefined, name: string): string | undefined {
  return h?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
}

export function extractBody(part: GmailPart | undefined): { html: string; text: string; hasAttachments: boolean } {
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

export function extractAttachments(part: GmailPart | undefined): Array<{ attachment_id: string; part_id?: string; filename: string; mime_type: string; size: number }> {
  const out: Array<{ attachment_id: string; part_id?: string; filename: string; mime_type: string; size: number }> = [];
  function walk(p?: GmailPart) {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({
        attachment_id: p.body.attachmentId, part_id: p.partId, filename: p.filename,
        mime_type: p.mimeType ?? "application/octet-stream", size: p.body.size ?? 0,
      });
    }
    p.parts?.forEach(walk);
  }
  walk(part);
  return out;
}

export function parseFrom(v: string | undefined): { name: string; email: string } {
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

const ATTACHMENT_BUCKET = "email-attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function attStoragePath(tenantId: string, owner: string, emailId: string, attachmentId: string, filename: string): string {
  const safeName = (filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${tenantId}/${owner}/${emailId}/${attachmentId}_${safeName}`;
}

async function downloadAttachmentToStorage(
  supabase: SupabaseClient, tenantId: string, owner: string, messageId: string, emailId: string,
  att: { attachment_id: string; filename: string; mime_type: string; size: number },
): Promise<string | null> {
  if (att.size && att.size > MAX_ATTACHMENT_BYTES) return null;
  const path = attStoragePath(tenantId, owner, emailId, att.attachment_id, att.filename);
  const { data: existing } = await supabase.storage.from(ATTACHMENT_BUCKET).list(`${tenantId}/${owner}/${emailId}`, { search: `${att.attachment_id}_` });
  if (existing && existing.length > 0) return path;
  try {
    const r = (await gw(`/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(att.attachment_id)}`)) as { data: string; size: number };
    const bytes = b64UrlToBytes(r.data);
    const { error: upErr } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
      contentType: att.mime_type || "application/octet-stream", upsert: true,
    });
    if (upErr) { console.error("attachment upload failed", path, upErr.message); return null; }
    return path;
  } catch (e) {
    console.error("attachment fetch failed", att.filename, e);
    return null;
  }
}

async function resolveOwnerTenantId(supabase: SupabaseClient, owner: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_email_accounts")
    .select("tenant_id")
    .eq("email_address", owner)
    .limit(1)
    .maybeSingle();
  return (data as any)?.tenant_id ?? null;
}

export async function fetchAndStoreMessage(supabase: SupabaseClient, owner: string, messageId: string) {
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
    owner_email: owner, gmail_id: m.id, thread_id: m.threadId,
    from_email: from.email, from_name: from.name, to_emails: to,
    subject, snippet: m.snippet ?? "", body_html: html, body_text: text,
    received_at: internalDate, internal_date: internalDate, labels,
    is_unread: labels.includes("UNREAD"), is_starred: labels.includes("STARRED"), is_important: labels.includes("IMPORTANT"),
    has_attachments: hasAttachments,
    history_id: m.historyId ? Number(m.historyId) : null,
    size_estimate: m.sizeEstimate ?? null,
    category: categoryFromLabels(labels),
  };

  const { data: upserted, error } = await supabase
    .from("emails").upsert(row, { onConflict: "owner_email,gmail_id" }).select("id").single();
  if (error) throw new Error(`emails upsert: ${error.message}`);

  if (hasAttachments && upserted?.id) {
    const atts = extractAttachments(m.payload);
    if (atts.length) {
      await supabase.from("email_attachments").delete().eq("email_id", upserted.id);
      const inserted = atts.map((a) => ({ ...a, email_id: upserted.id, storage_path: null as string | null }));
      await supabase.from("email_attachments").insert(inserted);
      for (const a of atts) {
        const path = await downloadAttachmentToStorage(supabase, owner, m.id, upserted.id, a);
        if (path) {
          await supabase.from("email_attachments")
            .update({ storage_path: path }).eq("email_id", upserted.id).eq("attachment_id", a.attachment_id);
        }
      }
    }
  }
  return { id: upserted?.id, threadId: m.threadId, owner };
}

export async function rebuildThread(supabase: SupabaseClient, owner: string, threadId: string) {
  const { data: msgs } = await supabase
    .from("emails")
    .select("from_email, from_name, to_emails, subject, snippet, internal_date, labels, is_unread, is_starred, is_important, has_attachments")
    .eq("owner_email", owner)
    .eq("thread_id", threadId).order("internal_date", { ascending: true });
  if (!msgs || msgs.length === 0) {
    await supabase.from("email_threads").delete().eq("owner_email", owner).eq("id", threadId);
    return;
  }
  const participants = Array.from(new Set(msgs.flatMap((m: any) => [m.from_name || m.from_email, ...(m.to_emails ?? [])]).filter(Boolean)));
  const last = msgs[msgs.length - 1];
  const allLabels = Array.from(new Set(msgs.flatMap((m: any) => m.labels ?? [])));
  await supabase.from("email_threads").upsert({
    id: threadId, owner_email: owner, subject: msgs[0].subject ?? "", snippet: last.snippet ?? "",
    participants, last_message_at: last.internal_date, message_count: msgs.length,
    is_unread: msgs.some((m: any) => m.is_unread), is_starred: msgs.some((m: any) => m.is_starred),
    is_important: msgs.some((m: any) => m.is_important), has_attachments: msgs.some((m: any) => m.has_attachments),
    labels: allLabels, updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email,id" });
}

// ---------------- LABELS ----------------
export async function listAndPersistLabels(supabase: SupabaseClient): Promise<{ owner: string; labels: Array<{ id: string; type: string; name: string }> }> {
  const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
  const owner = profile.emailAddress.toLowerCase();

  const list = (await gw(`/users/me/labels`)) as { labels: Array<{ id: string; name: string; type: string; messageListVisibility?: string; labelListVisibility?: string }> };
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
    id: d!.id, owner_email: owner, name: d!.name, type: d!.type,
    color_bg: d!.color?.backgroundColor ?? null, color_text: d!.color?.textColor ?? null,
    unread_count: d!.messagesUnread ?? 0, total_count: d!.messagesTotal ?? 0,
    message_list_visibility: d!.messageListVisibility ?? null,
    label_list_visibility: d!.labelListVisibility ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabase.from("email_labels").upsert(rows, { onConflict: "owner_email,id" });
    if (error) throw new Error(`labels upsert: ${error.message}`);
  }
  return { owner, labels: rows.map((r) => ({ id: r.id, type: r.type, name: r.name })) };
}

// Build the ordered label queue: system priority, then user labels alphabetical
const SYSTEM_ORDER = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"];
function buildLabelQueue(labels: Array<{ id: string; type: string; name: string }>): string[] {
  const ids = new Set(labels.map((l) => l.id));
  const sys = SYSTEM_ORDER.filter((id) => ids.has(id));
  const user = labels
    .filter((l) => l.type === "user")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => l.id);
  return [...sys, ...user];
}

// Format YYYY/MM/DD
function fmtGmailDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}
function monthWindow(monthOffset: number): { after: string; before: string; label: string } {
  const now = new Date();
  const before = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  before.setUTCDate(before.getUTCDate() - monthOffset * 30 + 1);
  const after = new Date(before);
  after.setUTCDate(after.getUTCDate() - 31);
  const labelDate = new Date(before);
  labelDate.setUTCDate(labelDate.getUTCDate() - 15);
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return {
    after: fmtGmailDate(after), before: fmtGmailDate(before),
    label: `${months[labelDate.getUTCMonth()]}/${labelDate.getUTCFullYear()}`,
  };
}

const SYSTEM_TRASH_SPAM = new Set(["SPAM", "TRASH"]);
const EMPTY_STREAK_LIMIT = 3; // 3 consecutive empty months → label done (open-ended)
const HARD_MONTH_CAP = 360; // 30 years safety cap

// Initialize a brand-new full mirror for the connected account.
export async function startFullMirror(supabase: SupabaseClient): Promise<{ owner: string; queue: string[] }> {
  const { owner, labels } = await listAndPersistLabels(supabase);
  const queue = buildLabelQueue(labels);
  // Snapshot the current Gmail historyId so the post-mirror incremental sync
  // starts from "now" instead of a stale cursor that would 404.
  const profile = (await gw(`/users/me/profile`)) as { emailAddress: string; historyId?: string };
  await supabase.from("email_sync_state").upsert({
    owner_email: owner,
    full_sync_in_progress: true,
    full_sync_started_at: new Date().toISOString(),
    full_sync_label_queue: queue,
    full_sync_current_label: queue[0] ?? null,
    full_sync_current_month_offset: 0,
    full_sync_page_token: null,
    full_sync_total_synced: 0,
    full_sync_window_days: null, // null = open-ended (full history)
    full_sync_empty_streak: 0,
    last_history_id: profile.historyId ? Number(profile.historyId) : null,
    last_incremental_sync_at: null,
    last_full_sync_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email" });
  return { owner, queue };
}

// Run ONE tick of full sync for the given owner (one page of message IDs).
export async function runFullSyncTick(supabase: SupabaseClient, owner: string): Promise<{
  done: boolean; label: string | null; nextLabel: string | null;
  monthOffset: number; monthLabel: string; syncedThisRun: number;
  totalSynced: number; threads: number;
}> {
  const { data: state } = await supabase
    .from("email_sync_state")
    .select("full_sync_page_token, full_sync_total_synced, full_sync_current_label, full_sync_current_month_offset, full_sync_window_days, full_sync_label_queue, full_sync_empty_streak")
    .eq("owner_email", owner).maybeSingle();
  if (!state) {
    return { done: true, label: null, nextLabel: null, monthOffset: 0, monthLabel: "", syncedThisRun: 0, totalSynced: 0, threads: 0 };
  }
  const s: any = state;
  let queue: string[] = Array.isArray(s.full_sync_label_queue) ? [...s.full_sync_label_queue] : [];
  if (queue.length === 0 && s.full_sync_current_label) queue = [s.full_sync_current_label];
  if (queue.length === 0) {
    // Nothing to do — mark done
    await supabase.from("email_sync_state").update({
      full_sync_in_progress: false, last_full_sync_at: new Date().toISOString(),
      full_sync_current_label: null, full_sync_page_token: null, full_sync_empty_streak: 0,
      updated_at: new Date().toISOString(),
    }).eq("owner_email", owner);
    return { done: true, label: null, nextLabel: null, monthOffset: 0, monthLabel: "", syncedThisRun: 0, totalSynced: s.full_sync_total_synced ?? 0, threads: 0 };
  }
  const currentLabel: string = s.full_sync_current_label ?? queue[0];
  const monthOffset: number = Math.max(0, Number(s.full_sync_current_month_offset ?? 0));
  const pageToken: string | undefined = s.full_sync_page_token ?? undefined;
  const windowDays: number | null = s.full_sync_window_days ?? null; // null = open-ended
  const totalMonthsCap = windowDays ? Math.max(1, Math.ceil(windowDays / 30)) : HARD_MONTH_CAP;

  const win = monthWindow(monthOffset);
  const params = new URLSearchParams();
  params.set("maxResults", "50");
  params.set("labelIds", currentLabel);
  params.set("q", `after:${win.after} before:${win.before}`);
  if (SYSTEM_TRASH_SPAM.has(currentLabel)) params.set("includeSpamTrash", "true");
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

  const totalSynced = (s.full_sync_total_synced ?? 0) + ids.length;

  // Advance cursor
  let nextLabel: string | null = currentLabel;
  let nextMonthOffset = monthOffset;
  let nextToken: string | undefined = nextPageToken;
  let emptyStreak: number = Number(s.full_sync_empty_streak ?? 0);
  let labelDone = false;

  if (nextPageToken) {
    // more pages in this month — same cursor
    emptyStreak = 0;
  } else {
    // month finished — track empty streak for open-ended mode
    if (ids.length === 0) emptyStreak += 1; else emptyStreak = 0;
    const reachedCap = monthOffset + 1 >= totalMonthsCap;
    const reachedEmptyEnd = windowDays === null && emptyStreak >= EMPTY_STREAK_LIMIT;
    if (reachedCap || reachedEmptyEnd) {
      labelDone = true;
    } else {
      nextMonthOffset = monthOffset + 1;
      nextToken = undefined;
    }
  }

  let newQueue = queue;
  let done = false;
  if (labelDone) {
    newQueue = queue.slice(1);
    if (newQueue.length === 0) {
      done = true;
      nextLabel = null;
    } else {
      nextLabel = newQueue[0];
      nextMonthOffset = 0;
      nextToken = undefined;
      emptyStreak = 0;
    }
  }

  await supabase.from("email_sync_state").upsert({
    owner_email: owner,
    full_sync_in_progress: !done,
    full_sync_label_queue: newQueue,
    full_sync_current_label: done ? null : nextLabel,
    full_sync_current_month_offset: done ? 0 : nextMonthOffset,
    full_sync_page_token: nextToken ?? null,
    full_sync_total_synced: totalSynced,
    full_sync_empty_streak: emptyStreak,
    full_sync_started_at: done ? null : (s.full_sync_started_at ?? new Date().toISOString()),
    last_full_sync_at: done ? new Date().toISOString() : null,
    last_incremental_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email" });

  return {
    done, label: currentLabel, nextLabel,
    monthOffset, monthLabel: win.label,
    syncedThisRun: ids.length, totalSynced, threads: threadIds.size,
  };
}

// ---------------- Wipe (batched, resumable) ----------------
// One small step per call. Returns { done } so the cron can stop calling.
const WIPE_BUCKET = "email-attachments";
const WIPE_CHUNK = 200;

export async function enqueueWipe(supabase: SupabaseClient, owner: string) {
  await supabase.from("email_sync_state").upsert({
    owner_email: owner,
    full_sync_in_progress: false,
    full_sync_label_queue: [],
    full_sync_page_token: null,
    full_sync_current_label: null,
    full_sync_current_month_offset: 0,
    full_sync_empty_streak: 0,
    wipe_status: "wiping",
    wipe_step: "storage",
    wipe_deleted_count: 0,
    wipe_started_at: new Date().toISOString(),
    wipe_finished_at: null,
    wipe_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email" });
}

export async function runWipeBatch(supabase: SupabaseClient, owner: string): Promise<{ done: boolean; step: string; deleted: number }> {
  const { data: st } = await supabase.from("email_sync_state")
    .select("wipe_status, wipe_step, wipe_deleted_count").eq("owner_email", owner).maybeSingle();
  const s: any = st;
  if (!s || s.wipe_status !== "wiping") return { done: true, step: "idle", deleted: 0 };
  let step: string = s.wipe_step ?? "storage";
  let deleted: number = Number(s.wipe_deleted_count ?? 0);

  try {
    if (step === "storage") {
      const { data: folders } = await supabase.storage.from(WIPE_BUCKET).list(owner, { limit: 50 });
      if (!folders || folders.length === 0) {
        step = "attachments";
      } else {
        const sub = `${owner}/${folders[0].name}`;
        const { data: files } = await supabase.storage.from(WIPE_BUCKET).list(sub, { limit: 1000 });
        if (files && files.length > 0) {
          await supabase.storage.from(WIPE_BUCKET).remove(files.map((f: any) => `${sub}/${f.name}`));
        }
      }
    } else if (step === "attachments") {
      const { data: rows } = await supabase.from("email_attachments").select("id").limit(WIPE_CHUNK);
      const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (ids.length === 0) step = "emails";
      else {
        await supabase.from("email_attachments").delete().in("id", ids);
        deleted += ids.length;
      }
    } else if (step === "emails") {
      const { data: rows } = await supabase.from("emails").select("id").eq("owner_email", owner).limit(WIPE_CHUNK);
      const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (ids.length === 0) step = "threads";
      else {
        await supabase.from("emails").delete().in("id", ids);
        deleted += ids.length;
      }
    } else if (step === "threads") {
      const { data: rows } = await supabase.from("email_threads").select("id").eq("owner_email", owner).limit(WIPE_CHUNK);
      const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (ids.length === 0) step = "labels";
      else await supabase.from("email_threads").delete().in("id", ids);
    } else if (step === "labels") {
      await supabase.from("email_labels").delete().eq("owner_email", owner);
      step = "reset";
    } else if (step === "reset") {
      await supabase.from("email_sync_state").update({
        full_sync_total_synced: 0,
        last_history_id: null,
        last_full_sync_at: null,
        last_incremental_sync_at: null,
        full_sync_started_at: null,
      }).eq("owner_email", owner);
      // Bootstrap fresh full mirror
      await startFullMirror(supabase);
      await supabase.from("email_sync_state").update({
        wipe_status: "done",
        wipe_step: null,
        wipe_finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("owner_email", owner);
      return { done: true, step: "done", deleted };
    }

    await supabase.from("email_sync_state").update({
      wipe_step: step, wipe_deleted_count: deleted, updated_at: new Date().toISOString(),
    }).eq("owner_email", owner);
    return { done: false, step, deleted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("email_sync_state").update({
      wipe_status: "failed", wipe_error: msg, updated_at: new Date().toISOString(),
    }).eq("owner_email", owner);
    return { done: true, step: "failed", deleted };
  }
}

// ---------------- Incremental sync ----------------
export async function runIncrementalSync(supabase: SupabaseClient, owner: string): Promise<{ added: number; deleted: number; needsFullSync?: boolean }> {
  const { data: state } = await supabase
    .from("email_sync_state").select("last_history_id").eq("owner_email", owner).maybeSingle();
  if (!state?.last_history_id) {
    // Try to seed history id from profile
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string; historyId?: string };
    if (profile.historyId) {
      await supabase.from("email_sync_state").upsert({
        owner_email: owner, last_history_id: Number(profile.historyId),
        last_incremental_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "owner_email" });
    }
    return { added: 0, deleted: 0, needsFullSync: true };
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
    try { res = await gw(`/users/me/history?${params.toString()}`); }
    catch (e: any) {
      if (String(e.message || "").includes("404")) {
        // Cursor expired (>7 days). Reset state so the cron stops looping
        // 404s and waits for a fresh full mirror to be started manually.
        await supabase.from("email_sync_state").update({
          last_history_id: null,
          last_full_sync_at: null,
          updated_at: new Date().toISOString(),
        }).eq("owner_email", owner);
        return { added: 0, deleted: 0, needsFullSync: true };
      }
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

  const toFetch = new Set<string>([...addedIds, ...labelChanged.keys()]);
  deletedIds.forEach((id) => toFetch.delete(id));
  const threadIds = new Set<string>();
  const arr = Array.from(toFetch);
  for (let i = 0; i < arr.length; i += 6) {
    const batch = arr.slice(i, i + 6);
    const results = await Promise.all(batch.map(async (id) => {
      try { return await fetchAndStoreMessage(supabase, owner, id); }
      catch (e) { console.error("inc msg fail", id, e); return null; }
    }));
    results.forEach((r) => { if (r?.threadId) threadIds.add(r.threadId); });
  }
  if (deletedIds.size) {
    const arrDel = Array.from(deletedIds);
    const { data: delRows } = await supabase.from("emails").select("thread_id").in("gmail_id", arrDel);
    (delRows ?? []).forEach((r: any) => { if (r.thread_id) threadIds.add(r.thread_id); });
    await supabase.from("emails").delete().in("gmail_id", arrDel);
  }
  for (const tid of threadIds) await rebuildThread(supabase, owner, tid);

  await supabase.from("email_sync_state").upsert({
    owner_email: owner, last_history_id: latestHistoryId,
    last_incremental_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "owner_email" });

  return { added: addedIds.size, deleted: deletedIds.size };
}
