drop policy if exists "Authenticated manage quote_items" on public.quote_items;
create policy "Insert quote_items if owns quote" on public.quote_items for insert to authenticated
  with check (exists (select 1 from public.quotes q where q.id = quote_id and (q.created_by = auth.uid() or public.is_admin(auth.uid()))));
create policy "Update quote_items if owns quote" on public.quote_items for update to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and (q.created_by = auth.uid() or public.is_admin(auth.uid()))));
create policy "Delete quote_items if owns quote" on public.quote_items for delete to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and (q.created_by = auth.uid() or public.is_admin(auth.uid()))));

drop policy if exists "Authenticated manage booking_pax" on public.booking_pax;
create policy "Insert booking_pax if owns booking" on public.booking_pax for insert to authenticated
  with check (exists (select 1 from public.bookings b where b.id = booking_id and (b.created_by = auth.uid() or public.is_admin(auth.uid()) or public.has_role(auth.uid(),'operacional'))));
create policy "Update booking_pax if owns booking" on public.booking_pax for update to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.created_by = auth.uid() or public.is_admin(auth.uid()) or public.has_role(auth.uid(),'operacional'))));
create policy "Delete booking_pax if owns booking" on public.booking_pax for delete to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.created_by = auth.uid() or public.is_admin(auth.uid()) or public.has_role(auth.uid(),'operacional'))));