
DELETE FROM public.email_attachments WHERE email_id IN (SELECT id FROM public.emails WHERE owner_email = 'booking@adatours.com');
DELETE FROM public.emails WHERE owner_email = 'booking@adatours.com';
DELETE FROM public.email_threads WHERE owner_email = 'booking@adatours.com';
DELETE FROM public.email_labels WHERE owner_email = 'booking@adatours.com';
UPDATE public.email_sync_state SET
  wipe_status = 'idle',
  wipe_step = NULL,
  wipe_deleted_count = 0,
  wipe_started_at = NULL,
  wipe_finished_at = NULL,
  wipe_error = NULL,
  full_sync_in_progress = false,
  full_sync_label_queue = ARRAY[]::text[],
  full_sync_page_token = NULL,
  full_sync_current_label = NULL,
  full_sync_current_month_offset = 0,
  full_sync_empty_streak = 0,
  full_sync_total_synced = 0,
  full_sync_started_at = NULL,
  last_history_id = NULL,
  last_incremental_sync_at = NULL,
  updated_at = now()
WHERE owner_email = 'booking@adatours.com';
