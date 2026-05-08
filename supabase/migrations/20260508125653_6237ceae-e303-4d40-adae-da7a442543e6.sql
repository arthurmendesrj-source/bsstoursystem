
-- 1. Novas colunas em emails
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS history_id bigint,
  ADD COLUMN IF NOT EXISTS internal_date timestamptz,
  ADD COLUMN IF NOT EXISTS size_estimate int,
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_important boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_emails_internal_date ON public.emails (internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_history_id ON public.emails (history_id);

-- 2. email_labels
CREATE TABLE IF NOT EXISTS public.email_labels (
  id text PRIMARY KEY,
  owner_email text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'user',
  color_bg text,
  color_text text,
  unread_count int NOT NULL DEFAULT 0,
  total_count int NOT NULL DEFAULT 0,
  message_list_visibility text,
  label_list_visibility text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_labels_owner ON public.email_labels (owner_email);
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read email_labels" ON public.email_labels;
CREATE POLICY "Authenticated read email_labels" ON public.email_labels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff write email_labels" ON public.email_labels;
CREATE POLICY "Staff write email_labels" ON public.email_labels FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role));

-- 3. email_threads
CREATE TABLE IF NOT EXISTS public.email_threads (
  id text PRIMARY KEY,
  owner_email text NOT NULL,
  subject text,
  snippet text,
  participants text[] NOT NULL DEFAULT '{}',
  last_message_at timestamptz,
  message_count int NOT NULL DEFAULT 0,
  is_unread boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_important boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  labels text[] NOT NULL DEFAULT '{}',
  history_id bigint,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_owner ON public.email_threads (owner_email);
CREATE INDEX IF NOT EXISTS idx_email_threads_last_msg ON public.email_threads (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_labels ON public.email_threads USING GIN (labels);
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read email_threads" ON public.email_threads;
CREATE POLICY "Authenticated read email_threads" ON public.email_threads FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff write email_threads" ON public.email_threads;
CREATE POLICY "Staff write email_threads" ON public.email_threads FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role));

-- 4. email_attachments
CREATE TABLE IF NOT EXISTS public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  attachment_id text NOT NULL,
  part_id text,
  filename text,
  mime_type text,
  size int,
  cached_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_attachments_email ON public.email_attachments (email_id);
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read email_attachments" ON public.email_attachments;
CREATE POLICY "Authenticated read email_attachments" ON public.email_attachments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff write email_attachments" ON public.email_attachments;
CREATE POLICY "Staff write email_attachments" ON public.email_attachments FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role));

-- 5. email_sync_state
CREATE TABLE IF NOT EXISTS public.email_sync_state (
  owner_email text PRIMARY KEY,
  last_history_id bigint,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  watch_expiration timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read email_sync_state" ON public.email_sync_state;
CREATE POLICY "Authenticated read email_sync_state" ON public.email_sync_state FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff write email_sync_state" ON public.email_sync_state;
CREATE POLICY "Staff write email_sync_state" ON public.email_sync_state FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'vendedor'::app_role) OR has_role(auth.uid(),'operacional'::app_role));

-- 6. Realtime
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.emails';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.email_labels';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
