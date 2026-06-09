-- 1) email_message_links: replace permissive SELECT with creator-or-admin
DROP POLICY IF EXISTS "Authenticated read email_message_links" ON public.email_message_links;
CREATE POLICY "Owner or admin read email_message_links"
ON public.email_message_links
FOR SELECT
TO authenticated
USING ((auth.uid() = created_by) OR is_admin(auth.uid()));

-- 2) whatsapp_accounts: add WITH CHECK on UPDATE to block ownership reassignment
DROP POLICY IF EXISTS wa_accounts_update_own ON public.whatsapp_accounts;
CREATE POLICY wa_accounts_update_own
ON public.whatsapp_accounts
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) OR is_admin(auth.uid()))
WITH CHECK ((auth.uid() = user_id) OR is_admin(auth.uid()));