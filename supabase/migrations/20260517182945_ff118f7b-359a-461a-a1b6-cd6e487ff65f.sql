
DROP POLICY IF EXISTS "Authenticated insert email_message_links" ON public.email_message_links;
CREATE POLICY "Authenticated insert email_message_links"
ON public.email_message_links FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);
