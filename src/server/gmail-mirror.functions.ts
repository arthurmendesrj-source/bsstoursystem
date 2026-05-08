// Thin createServerFn wrappers around shared helpers in gmail-mirror.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  gw, findHeader, parseFrom, extractBody, extractAttachments, type GmailPart,
  listAndPersistLabels, startFullMirror, runFullSyncTick, runIncrementalSync, enqueueWipe,
} from "@/server/gmail-mirror.server";

// ---------------- LABELS ----------------
export const gmailListLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const r = await listAndPersistLabels(supabase);
    return { count: r.labels.length, owner: r.owner };
  });

// ---------------- START FULL MIRROR ----------------
export const gmailStartFullMirror = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const r = await startFullMirror(supabase);
    return { owner: r.owner, queueLength: r.queue.length };
  });

// ---------------- CANCEL FULL MIRROR ----------------
// Stops the background sync: clears in-progress flag, label queue, page token,
// current label/month and empty-streak counter. Preserves total counters and
// last_full_sync_at for audit purposes.
export const gmailCancelFullMirror = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();
    await supabase.from("email_sync_state").update({
      full_sync_in_progress: false,
      full_sync_label_queue: [],
      full_sync_page_token: null,
      full_sync_current_label: null,
      full_sync_current_month_offset: 0,
      full_sync_empty_streak: 0,
    }).eq("owner_email", owner);
    return { owner, cancelled: true };
  });

// ---------------- RESET FULL MIRROR ----------------
// Cancels the in-flight sync, zeroes the totals, then re-initializes the
// queue from scratch via startFullMirror — equivalent to a fresh start.
export const gmailResetFullMirror = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();
    await supabase.from("email_sync_state").update({
      full_sync_in_progress: false,
      full_sync_label_queue: [],
      full_sync_page_token: null,
      full_sync_current_label: null,
      full_sync_current_month_offset: 0,
      full_sync_empty_streak: 0,
      full_sync_total_synced: 0,
    }).eq("owner_email", owner);
    const r = await startFullMirror(supabase);
    return { owner: r.owner, queueLength: r.queue.length, reset: true };
  });

// ---------------- WIPE AND RESTART ----------------
// Destructive: deletes ALL mirrored email data for the connected owner
// (attachments storage + DB rows for emails/threads/labels/attachments),
// resets the sync state, and re-initializes the full mirror queue.
const ATTACHMENT_BUCKET_WIPE = "email-attachments";
async function wipeOwnerStorage(supabase: any, owner: string) {
  // List all email folders under owner/, then list files inside each, then remove in chunks.
  const { data: folders } = await supabase.storage.from(ATTACHMENT_BUCKET_WIPE).list(owner, { limit: 1000 });
  if (!folders || folders.length === 0) return;
  for (const f of folders) {
    const sub = `${owner}/${f.name}`;
    const { data: files } = await supabase.storage.from(ATTACHMENT_BUCKET_WIPE).list(sub, { limit: 1000 });
    if (!files || files.length === 0) continue;
    const paths = files.map((x: any) => `${sub}/${x.name}`);
    for (let i = 0; i < paths.length; i += 100) {
      await supabase.storage.from(ATTACHMENT_BUCKET_WIPE).remove(paths.slice(i, i + 100));
    }
  }
}

// Just ENQUEUES the wipe — the cron drains it in small batches.
// Returns immediately so the UI never times out.
export const gmailWipeAndRestart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: string }) => {
    if (!d || d.confirm !== "ESVAZIAR") {
      throw new Error('Confirmação inválida. Digite "ESVAZIAR" para prosseguir.');
    }
    return d;
  })
  .handler(async ({ context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();
    await enqueueWipe(supabase, owner);
    return { owner, queueLength: 0, deletedEmails: 0, queued: true };
  });

// ---------------- FULL SYNC (one tick) ----------------
// Kept for manual UI invocation; the cron drives this same logic in the
// background via /api/public/gmail-cron-tick.
export const gmailFullSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { restart?: boolean; windowDays?: number }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.restart) {
      // Reuse start flow when caller asks for a fresh run.
      await startFullMirror(supabase);
    }
    // Resolve owner
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();

    // If a windowDays override was passed, patch state with it (legacy UI path).
    if (typeof data.windowDays === "number" && data.windowDays > 0) {
      await supabase.from("email_sync_state").update({
        full_sync_window_days: data.windowDays,
      }).eq("owner_email", owner);
    }

    const r = await runFullSyncTick(supabase, owner);
    return {
      done: r.done,
      label: r.label,
      nextLabel: r.nextLabel,
      monthOffset: r.monthOffset,
      monthLabel: r.monthLabel,
      nextMonthOffset: r.monthOffset, // kept for backwards compat with old UI
      totalMonths: 0,
      syncedThisRun: r.syncedThisRun,
      totalSynced: r.totalSynced,
      threads: r.threads,
      owner,
      hasMore: !r.done,
    };
  });

// ---------------- INCREMENTAL SYNC ----------------
export const gmailIncrementalSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();
    const r = await runIncrementalSync(supabase, owner);
    return { ...r, owner };
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
        bodyHtml: html, bodyText: text,
        hasAttachments, attachments,
        isUnread: (m.labelIds ?? []).includes("UNREAD"),
      };
    });
    return { threadId: t.id, messages };
  });

// ---------------- GET ATTACHMENT ----------------
const ATTACHMENT_BUCKET = "email-attachments";
export const gmailGetAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; attachmentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("email_attachments")
      .select("storage_path, mime_type, filename, size")
      .eq("attachment_id", data.attachmentId).maybeSingle();
    const storagePath = (row as any)?.storage_path as string | null | undefined;
    if (storagePath) {
      const { data: blob, error } = await supabase.storage.from(ATTACHMENT_BUCKET).download(storagePath);
      if (!error && blob) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        return { dataB64Url: b64, size: buf.length };
      }
    }
    const att = (await gw(`/users/me/messages/${encodeURIComponent(data.messageId)}/attachments/${encodeURIComponent(data.attachmentId)}`)) as { data: string; size: number };
    return { dataB64Url: att.data, size: att.size };
  });
