-- Buckets
insert into storage.buckets (id, name, public) values ('invoice-templates', 'invoice-templates', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('invoice-docs', 'invoice-docs', false)
on conflict (id) do nothing;

-- Policies for invoice-templates: only admins can manage; service role bypasses RLS
create policy "Admins can read invoice templates"
on storage.objects for select to authenticated
using (bucket_id = 'invoice-templates' and public.is_admin(auth.uid()));

create policy "Admins can write invoice templates"
on storage.objects for insert to authenticated
with check (bucket_id = 'invoice-templates' and public.is_admin(auth.uid()));

create policy "Admins can update invoice templates"
on storage.objects for update to authenticated
using (bucket_id = 'invoice-templates' and public.is_admin(auth.uid()));

create policy "Admins can delete invoice templates"
on storage.objects for delete to authenticated
using (bucket_id = 'invoice-templates' and public.is_admin(auth.uid()));

-- Policies for invoice-docs: any authenticated user can read/write (RLS at app level via signed URLs)
create policy "Authenticated can read invoice docs"
on storage.objects for select to authenticated
using (bucket_id = 'invoice-docs');

create policy "Authenticated can write invoice docs"
on storage.objects for insert to authenticated
with check (bucket_id = 'invoice-docs');

create policy "Authenticated can update invoice docs"
on storage.objects for update to authenticated
using (bucket_id = 'invoice-docs');

create policy "Authenticated can delete invoice docs"
on storage.objects for delete to authenticated
using (bucket_id = 'invoice-docs');
