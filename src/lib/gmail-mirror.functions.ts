// Thin createServerFn wrappers around shared helpers in gmail-mirror.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGmailAccount } from "@/server/gmail-auth-middleware";
import {
  gw, findHeader, parseFrom, extractBody, extractAttachments, type GmailPart,
  listAndPersistLabels, startFullMirror, runFullSyncTick, runIncrementalSync, enqueueWipe,
} from "@/server/gmail-mirror.server";

// ---------------- LABELS ----------------
export const gmailListLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const r = await listAndPersistLabels(supabase);
    return { count: r.labels.length, owner: r.owner };
  });

// ---------------- LIST LIVE FROM GMAIL (lightweight metadata) ----------------
// Busca diretamente no Gmail uma página de mensagens da label, salva metadados
// no cache (emails + email_threads) e devolve as conversas mais recentes
// imediatamente. Não baixa corpo nem anexos — isso é feito sob demanda em
// gmailGetThread quando o usuário abre a conversa.
export const gmailListLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
  .inputValidator((d: { labelId: string; pageToken?: string; maxResults?: number; q?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();

    const params = new URLSearchParams();
    params.set("maxResults", String(Math.min(100, Math.max(10, data.maxResults ?? 50))));
    if (data.labelId) params.set("labelIds", data.labelId);
    if (data.q) params.set("q", data.q);
    if (data.pageToken) params.set("pageToken", data.pageToken);
    if (data.labelId === "SPAM" || data.labelId === "TRASH") params.set("includeSpamTrash", "true");

    const list = (await gw(`/users/me/messages?${params.toString()}`)) as {
      messages?: { id: string; threadId: string }[]; nextPageToken?: string;
    };
    const items = list.messages ?? [];

    // Busca metadados (cabeçalhos) em paralelo, em lotes pequenos.
    const CONC = 8;
    const threadIds = new Set<string>();
    const upserts: any[] = [];
    for (let i = 0; i < items.length; i += CONC) {
      const batch = items.slice(i, i + CONC);
      const results = await Promise.all(batch.map(async (m) => {
        try {
          const r = (await gw(`/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)) as {
            id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string;
            historyId?: string; sizeEstimate?: number; payload?: GmailPart;
          };
          const headers = r.payload?.headers;
          const from = parseFrom(findHeader(headers, "From"));
          const to = (findHeader(headers, "To") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const subject = findHeader(headers, "Subject") ?? "";
          const dateHeader = findHeader(headers, "Date");
          const internalDate = r.internalDate ? new Date(Number(r.internalDate)).toISOString() : (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString());
          const labels = r.labelIds ?? [];
          return {
            owner_email: owner, gmail_id: r.id, thread_id: r.threadId,
            from_email: from.email, from_name: from.name, to_emails: to,
            subject, snippet: r.snippet ?? "",
            received_at: internalDate, internal_date: internalDate, labels,
            is_unread: labels.includes("UNREAD"),
            is_starred: labels.includes("STARRED"),
            is_important: labels.includes("IMPORTANT"),
            has_attachments: false,
            history_id: r.historyId ? Number(r.historyId) : null,
            size_estimate: r.sizeEstimate ?? null,
          };
        } catch (e) {
          console.error("listLive metadata fail", m.id, e);
          return null;
        }
      }));
      for (const row of results) {
        if (!row) continue;
        upserts.push(row);
        threadIds.add(row.thread_id);
      }
    }

    if (upserts.length) {
      const { error } = await supabase.from("emails").upsert(upserts, { onConflict: "gmail_id" });
      if (error) console.error("listLive emails upsert", error.message);
    }

    // Reconstrói as threads tocadas a partir do cache (operação leve).
    for (const tid of threadIds) {
      const { data: msgs } = await supabase
        .from("emails")
        .select("from_email, from_name, to_emails, subject, snippet, internal_date, labels, is_unread, is_starred, is_important, has_attachments")
        .eq("thread_id", tid).order("internal_date", { ascending: true });
      const list = (msgs ?? []) as any[];
      if (list.length === 0) continue;
      const participants = Array.from(new Set(list.flatMap((m) => [m.from_name || m.from_email, ...(m.to_emails ?? [])]).filter(Boolean)));
      const last = list[list.length - 1];
      const allLabels = Array.from(new Set(list.flatMap((m) => m.labels ?? [])));
      await supabase.from("email_threads").upsert({
        id: tid, owner_email: owner, subject: list[0].subject ?? "", snippet: last.snippet ?? "",
        participants, last_message_at: last.internal_date, message_count: list.length,
        is_unread: list.some((m) => m.is_unread), is_starred: list.some((m) => m.is_starred),
        is_important: list.some((m) => m.is_important), has_attachments: list.some((m) => m.has_attachments),
        labels: allLabels, updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    }

    return {
      owner,
      labelId: data.labelId,
      count: upserts.length,
      threads: threadIds.size,
      nextPageToken: list.nextPageToken ?? null,
    };
  });

// ---------------- START FULL MIRROR ----------------
export const gmailStartFullMirror = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const profile = (await gw(`/users/me/profile`)) as { emailAddress: string };
    const owner = profile.emailAddress.toLowerCase();
    const r = await runIncrementalSync(supabase, owner);
    return { ...r, owner };
  });

// ---------------- GET THREAD (full) ----------------
export const gmailGetThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
  .middleware([requireSupabaseAuth, requireGmailAccount])
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
