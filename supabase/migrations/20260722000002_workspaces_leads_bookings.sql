-- Single-tenant workspace + agent logging tables (generic booking)

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  phone text,
  address text,
  cal_event_type_id integer,
  cal_event_type_slug text,
  cal_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_updated_at
before update on public.workspaces
for each row
execute function public.handle_updated_at();

alter table public.profiles
  add constraint profiles_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces (id) on delete set null;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  full_name text,
  phone text,
  email text,
  service text,
  urgency text,
  notes text,
  session_id text,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  cal_booking_uid text unique,
  guest_name text not null,
  guest_phone text,
  guest_email text not null,
  service text,
  start_time timestamptz not null,
  status text not null default 'confirmed',
  notes text,
  session_id text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.conversation_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  session_id text not null,
  summary text,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.leads enable row level security;
alter table public.bookings enable row level security;
alter table public.conversation_logs enable row level security;

create policy "Users can read own workspace"
on public.workspaces
for select
to authenticated
using (
  id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can read workspace leads"
on public.leads
for select
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can read workspace bookings"
on public.bookings
for select
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can read workspace conversation logs"
on public.conversation_logs
for select
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

-- Pilot seed workspace (FAQ data in supabase/seed.sql)
insert into public.workspaces (id, name, timezone)
values (
  '00000000-0000-4000-8000-000000000001',
  'Eve Pilot',
  'Asia/Ho_Chi_Minh'
);
