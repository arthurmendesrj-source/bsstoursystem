-- =========== ENUMS ===========
create type public.app_role as enum ('admin', 'vendedor', 'operacional', 'financeiro');
create type public.lead_status as enum ('novo', 'qualificado', 'cotacao', 'proposta', 'fechado', 'perdido');
create type public.booking_status as enum ('pre_reserva', 'confirmada', 'em_viagem', 'concluida', 'cancelada');
create type public.quote_status as enum ('rascunho', 'enviada', 'aprovada', 'rejeitada');
create type public.interaction_type as enum ('ligacao', 'email', 'reuniao', 'nota', 'whatsapp');
create type public.currency_code as enum ('BRL', 'USD', 'EUR');

-- =========== UTILITY FUNCTIONS ===========
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- =========== PROFILES ===========
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  preferred_language text default 'pt',
  preferred_currency public.currency_code default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========== USER ROLES ===========
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin');
$$;

-- Profiles policies
create policy "Users view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Admins view all profiles" on public.profiles for select using (public.is_admin(auth.uid()));
create policy "Users update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Admins update all profiles" on public.profiles for update using (public.is_admin(auth.uid()));

-- User roles policies
create policy "Users view own roles" on public.user_roles for select using (auth.uid() = user_id);
create policy "Admins view all roles" on public.user_roles for select using (public.is_admin(auth.uid()));
create policy "Admins manage roles" on public.user_roles for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- =========== CURRENCIES & EXCHANGE RATES ===========
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency public.currency_code not null,
  target_currency public.currency_code not null,
  rate numeric(18,6) not null,
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (base_currency, target_currency, effective_date)
);
alter table public.exchange_rates enable row level security;
create policy "Authenticated read rates" on public.exchange_rates for select to authenticated using (true);
create policy "Admins manage rates" on public.exchange_rates for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Seed default rates
insert into public.exchange_rates (base_currency, target_currency, rate) values
  ('BRL','BRL',1),('USD','USD',1),('EUR','EUR',1),
  ('USD','BRL',5.00),('EUR','BRL',5.50),('BRL','USD',0.20),
  ('BRL','EUR',0.18),('USD','EUR',0.92),('EUR','USD',1.08);

-- =========== CUSTOMERS (PAX) ===========
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  document_number text,
  passport_number text,
  passport_expiry date,
  nationality text,
  birth_date date,
  preferences text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create trigger customers_updated_at before update on public.customers for each row execute function public.update_updated_at_column();
create policy "Authenticated read customers" on public.customers for select to authenticated using (true);
create policy "Authenticated insert customers" on public.customers for insert to authenticated with check (auth.uid() = created_by);
create policy "Owner or admin update customers" on public.customers for update to authenticated using (auth.uid() = created_by or public.is_admin(auth.uid()));
create policy "Admins delete customers" on public.customers for delete using (public.is_admin(auth.uid()));

-- =========== LEADS ===========
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  source text,
  status public.lead_status not null default 'novo',
  assigned_to uuid references auth.users(id),
  customer_id uuid references public.customers(id) on delete set null,
  destination text,
  estimated_value numeric(14,2),
  currency public.currency_code default 'BRL',
  expected_travel_date date,
  next_action text,
  next_action_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create trigger leads_updated_at before update on public.leads for each row execute function public.update_updated_at_column();
create policy "Authenticated read leads" on public.leads for select to authenticated using (true);
create policy "Authenticated insert leads" on public.leads for insert to authenticated with check (auth.uid() = created_by);
create policy "Assigned or admin update leads" on public.leads for update to authenticated using (auth.uid() = assigned_to or auth.uid() = created_by or public.is_admin(auth.uid()));
create policy "Admins delete leads" on public.leads for delete using (public.is_admin(auth.uid()));

-- =========== INTERACTIONS ===========
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  type public.interaction_type not null,
  subject text,
  content text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.interactions enable row level security;
create policy "Authenticated read interactions" on public.interactions for select to authenticated using (true);
create policy "Authenticated insert interactions" on public.interactions for insert to authenticated with check (auth.uid() = created_by);
create policy "Owner or admin manage interactions" on public.interactions for update to authenticated using (auth.uid() = created_by or public.is_admin(auth.uid()));
create policy "Owner or admin delete interactions" on public.interactions for delete using (auth.uid() = created_by or public.is_admin(auth.uid()));

-- =========== TASKS ===========
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date timestamptz,
  completed boolean not null default false,
  assigned_to uuid references auth.users(id),
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks enable row level security;
create trigger tasks_updated_at before update on public.tasks for each row execute function public.update_updated_at_column();
create policy "Assigned or admin read tasks" on public.tasks for select to authenticated using (auth.uid() = assigned_to or auth.uid() = created_by or public.is_admin(auth.uid()));
create policy "Authenticated insert tasks" on public.tasks for insert to authenticated with check (auth.uid() = created_by);
create policy "Assigned or admin update tasks" on public.tasks for update to authenticated using (auth.uid() = assigned_to or auth.uid() = created_by or public.is_admin(auth.uid()));
create policy "Owner or admin delete tasks" on public.tasks for delete using (auth.uid() = created_by or public.is_admin(auth.uid()));

-- =========== PACKAGES ===========
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text not null,
  duration_days int not null,
  description_pt text,
  description_en text,
  description_es text,
  base_price numeric(14,2) not null,
  base_currency public.currency_code not null default 'BRL',
  includes text,
  excludes text,
  photo_url text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.packages enable row level security;
create trigger packages_updated_at before update on public.packages for each row execute function public.update_updated_at_column();
create policy "Authenticated read packages" on public.packages for select to authenticated using (true);
create policy "Admins manage packages" on public.packages for all using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'operacional')) with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'operacional'));

-- =========== PACKAGE DATES ===========
create table public.package_dates (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  departure_date date not null,
  return_date date not null,
  capacity int not null default 0,
  booked int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.package_dates enable row level security;
create policy "Authenticated read package_dates" on public.package_dates for select to authenticated using (true);
create policy "Admin/op manage package_dates" on public.package_dates for all using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'operacional')) with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'operacional'));

-- =========== QUOTES ===========
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  status public.quote_status not null default 'rascunho',
  total_amount numeric(14,2) not null default 0,
  currency public.currency_code not null default 'BRL',
  discount numeric(14,2) default 0,
  notes text,
  valid_until date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
create trigger quotes_updated_at before update on public.quotes for each row execute function public.update_updated_at_column();
create policy "Authenticated read quotes" on public.quotes for select to authenticated using (true);
create policy "Authenticated insert quotes" on public.quotes for insert to authenticated with check (auth.uid() = created_by);
create policy "Owner or admin update quotes" on public.quotes for update to authenticated using (auth.uid() = created_by or public.is_admin(auth.uid()));
create policy "Admins delete quotes" on public.quotes for delete using (public.is_admin(auth.uid()));

-- =========== QUOTE ITEMS ===========
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  quantity int not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.quote_items enable row level security;
create policy "Authenticated read quote_items" on public.quote_items for select to authenticated using (true);
create policy "Authenticated manage quote_items" on public.quote_items for all to authenticated using (true) with check (true);

-- =========== BOOKINGS ===========
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  package_date_id uuid references public.package_dates(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.booking_status not null default 'pre_reserva',
  total_amount numeric(14,2) not null default 0,
  currency public.currency_code not null default 'BRL',
  departure_date date,
  return_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
create trigger bookings_updated_at before update on public.bookings for each row execute function public.update_updated_at_column();
create policy "Authenticated read bookings" on public.bookings for select to authenticated using (true);
create policy "Authenticated insert bookings" on public.bookings for insert to authenticated with check (auth.uid() = created_by);
create policy "Owner or admin update bookings" on public.bookings for update to authenticated using (auth.uid() = created_by or public.is_admin(auth.uid()) or public.has_role(auth.uid(),'operacional'));
create policy "Admins delete bookings" on public.bookings for delete using (public.is_admin(auth.uid()));

-- =========== BOOKING PAX ===========
create table public.booking_pax (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.booking_pax enable row level security;
create policy "Authenticated read booking_pax" on public.booking_pax for select to authenticated using (true);
create policy "Authenticated manage booking_pax" on public.booking_pax for all to authenticated using (true) with check (true);

-- =========== VOUCHERS ===========
create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  code text not null unique,
  itinerary text,
  emergency_contact text,
  issued_at timestamptz not null default now()
);
alter table public.vouchers enable row level security;
create policy "Authenticated read vouchers" on public.vouchers for select to authenticated using (true);
create policy "Admin/op manage vouchers" on public.vouchers for all using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'operacional')) with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'operacional'));

-- =========== INDEXES ===========
create index idx_leads_status on public.leads(status);
create index idx_leads_assigned on public.leads(assigned_to);
create index idx_bookings_status on public.bookings(status);
create index idx_bookings_dep on public.bookings(departure_date);
create index idx_interactions_customer on public.interactions(customer_id);
create index idx_interactions_lead on public.interactions(lead_id);
create index idx_tasks_assigned on public.tasks(assigned_to);
create index idx_quote_items_quote on public.quote_items(quote_id);
create index idx_package_dates_pkg on public.package_dates(package_id);