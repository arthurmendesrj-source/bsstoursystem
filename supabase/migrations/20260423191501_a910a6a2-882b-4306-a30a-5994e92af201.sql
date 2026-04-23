
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  gmail_id text not null unique,
  thread_id text,
  from_email text,
  from_name text,
  to_emails text[] default '{}',
  subject text,
  snippet text,
  body_html text,
  body_text text,
  received_at timestamptz,
  labels text[] default '{}',
  has_attachments boolean not null default false,
  is_unread boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  ai_suggestion jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_emails_received_at on public.emails(received_at desc);
create index idx_emails_thread_id on public.emails(thread_id);
create index idx_emails_lead_id on public.emails(lead_id);

alter table public.emails enable row level security;

create policy "Authenticated read emails"
  on public.emails for select
  to authenticated
  using (true);

create policy "Staff insert emails"
  on public.emails for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or public.has_role(auth.uid(), 'vendedor'::app_role)
    or public.has_role(auth.uid(), 'operacional'::app_role)
  );

create policy "Staff update emails"
  on public.emails for update
  to authenticated
  using (
    public.is_admin(auth.uid())
    or public.has_role(auth.uid(), 'vendedor'::app_role)
    or public.has_role(auth.uid(), 'operacional'::app_role)
  );

create policy "Admin delete emails"
  on public.emails for delete
  to authenticated
  using (public.is_admin(auth.uid()));

create trigger update_emails_updated_at
  before update on public.emails
  for each row execute function public.update_updated_at_column();
