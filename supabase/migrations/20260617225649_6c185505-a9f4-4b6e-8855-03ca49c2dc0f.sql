
-- 1. Add tenant_id column
ALTER TABLE public.user_audit_log ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 2. Backfill from actor's tenant_members
UPDATE public.user_audit_log u
SET tenant_id = tm.tenant_id
FROM public.tenant_members tm
WHERE u.tenant_id IS NULL
  AND tm.user_id = u.actor_id
  AND tm.is_active = true;

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_user_audit_log_tenant_created
  ON public.user_audit_log(tenant_id, created_at DESC);

-- 4. Replace RLS policies to enforce tenant isolation
DROP POLICY IF EXISTS "Admins can view user audit log" ON public.user_audit_log;
DROP POLICY IF EXISTS "user_audit_log_select" ON public.user_audit_log;
DROP POLICY IF EXISTS "tenant_isolation_user_audit_log" ON public.user_audit_log;

CREATE POLICY "user_audit_log_select_tenant"
  ON public.user_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id, auth.uid()))
  );
