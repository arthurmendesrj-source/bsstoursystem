-- Storage access audit log
CREATE TABLE IF NOT EXISTS public.storage_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NULL,
  user_id UUID NOT NULL,
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upload','download','delete','signed_url')),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','denied','error')),
  error_message TEXT NULL,
  file_size_bytes BIGINT NULL,
  content_type TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_access_log_tenant_created
  ON public.storage_access_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_access_log_user_created
  ON public.storage_access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_access_log_bucket_path
  ON public.storage_access_log (bucket, object_path);

ALTER TABLE public.storage_access_log ENABLE ROW LEVEL SECURITY;

-- View: tenant members (active) + super admins see their tenant's logs.
-- Logs without a tenant_id are only visible to super admins.
CREATE POLICY "storage_access_log_select_tenant_members"
  ON public.storage_access_log
  FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (
      tenant_id IS NOT NULL
      AND public.is_tenant_member(tenant_id, auth.uid())
    )
  );

-- Insert: any authenticated user can log their own access, optionally
-- scoped to a tenant they are a member of.
CREATE POLICY "storage_access_log_insert_self"
  ON public.storage_access_log
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      tenant_id IS NULL
      OR public.is_tenant_member(tenant_id, auth.uid())
    )
  );

-- No UPDATE or DELETE policies: audit records are append-only for regular users.
