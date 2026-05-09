alter table public.email_message_links
  add column if not exists activity_id uuid
  references public.operations_activities(id) on delete set null;

create index if not exists idx_eml_activity
  on public.email_message_links(activity_id);