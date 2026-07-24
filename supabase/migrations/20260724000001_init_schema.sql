-- =============================================================================
-- Eve Booking — init schema (consolidated)
-- =============================================================================
-- Replaces incremental migrations archived in supabase/migrations_archive/.
-- Demo/pilot data: supabase/seed.sql (applied after migrations on db reset).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  phone text,
  address text,
  email text,
  website text,
  tagline text,
  about text,
  business_hours text,
  services_summary text,
  agent_instructions text,
  chat_assistant_label text,
  chat_intro text,
  chat_suggestions jsonb,
  cal_event_type_id integer,
  cal_event_type_slug text,
  cal_username text,
  cal_api_key_encrypted text,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workspaces_slug_unique
  on public.workspaces (slug)
  where slug is not null;

create trigger workspaces_updated_at
before update on public.workspaces
for each row
execute function public.handle_updated_at();

comment on column public.workspaces.slug is 'Public chat tenant key (?w=slug)';
comment on column public.workspaces.cal_api_key_encrypted is 'AES-GCM encrypted Cal.com API key';
comment on column public.workspaces.setup_completed_at is 'Null until /dashboard/setup wizard finishes';
comment on column public.workspaces.email is 'Public contact email for guests / agent replies';
comment on column public.workspaces.website is 'Public website URL';
comment on column public.workspaces.tagline is 'One-line pitch the agent can use to introduce the business';
comment on column public.workspaces.about is 'Short about / intro paragraph for the agent';
comment on column public.workspaces.business_hours is 'Opening hours text (agent FAQ context)';
comment on column public.workspaces.services_summary is 'Services overview the agent can summarize';
comment on column public.workspaces.agent_instructions is 'Extra rules / tone / booking notes injected into agent context';
comment on column public.workspaces.chat_assistant_label is 'Empty-state eyebrow; null = app default';
comment on column public.workspaces.chat_intro is 'Empty-state description; null = app default';
comment on column public.workspaces.chat_suggestions is 'Quick-reply chips JSON [{label,prompt}]; null = app default';

-- -----------------------------------------------------------------------------
-- profiles + signup (multi-tenant: create workspace per user)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  workspace_id uuid references public.workspaces (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- Auth signup → workspace + profile
-- -----------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- KEEP IN SYNC with lib/workspace.ts → slugifyWorkspaceName() (npm slugify, locale vi).
-- Signup trigger must stay pure SQL; TS is for live preview + server actions.
create or replace function public.slugify_workspace_name(input text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  s text;
begin
  -- Mirror npm slugify({ lower, strict, locale: 'vi', trim }) + lib/workspace.ts wrapper.
  s := lower(trim(coalesce(input, '')));
  s := replace(s, '&', ' and ');
  s := replace(s, '@', ' at ');
  -- đ/Đ: belt-and-suspenders (unaccent usually maps these too; locale vi requires d)
  s := replace(replace(s, 'đ', 'd'), 'Đ', 'd');
  s := extensions.unaccent(s);
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := trim(both '-' from s);
  s := regexp_replace(s, '-{2,}', '-', 'g');
  if s is null or length(s) < 2 then
    return 'ws';
  end if;
  return left(s, 48);
end;
$$;

comment on function public.slugify_workspace_name(text) is
  'Booking URL slug ≈ npm slugify locale=vi. KEEP IN SYNC with lib/workspace.ts slugifyWorkspaceName(). Signup auto-dedupes (-1,-2); Settings rejects collisions.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
  base_slug text;
  final_slug text;
  ws_name text;
  n int := 0;
begin
  ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'workspace_name', '')), '');
  if ws_name is null then
    ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  end if;
  if ws_name is null then
    ws_name := split_part(coalesce(new.email, 'workspace'), '@', 1);
  end if;
  if ws_name is null or length(ws_name) < 1 then
    ws_name := 'Workspace';
  end if;

  base_slug := public.slugify_workspace_name(ws_name);
  final_slug := base_slug;

  -- Signup: silent auto-dedupe (-1, -2…). Settings rejects collisions instead.
  while exists (select 1 from public.workspaces where slug = final_slug) loop
    n := n + 1;
    final_slug := left(base_slug, 40) || '-' || n::text;
  end loop;

  insert into public.workspaces (name, slug, timezone)
  values (ws_name, final_slug, 'Asia/Ho_Chi_Minh')
  returning id into ws_id;

  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'owner'),
    ws_id
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------

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
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'booked', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_workspace_status_idx
  on public.leads (workspace_id, status, created_at desc);

create index leads_workspace_session_idx
  on public.leads (workspace_id, session_id)
  where session_id is not null;

create index leads_workspace_phone_idx
  on public.leads (workspace_id, phone)
  where phone is not null;

create trigger leads_updated_at
before update on public.leads
for each row
execute function public.handle_updated_at();

comment on column public.leads.status is
  'Lead lifecycle: new | contacted | qualified | booked | lost';

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------

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
  list_status text,
  notes text,
  session_id text,
  raw jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.bookings.synced_at is 'Last time this row was mirrored from Cal.com';
comment on column public.bookings.list_status is
  'Cal.com list filter at last sync (upcoming|unconfirmed|recurring|past|cancelled)';
comment on column public.bookings.status is
  'Cal.com booking lifecycle: accepted|pending|cancelled|rejected';

-- -----------------------------------------------------------------------------
-- conversation_logs
-- -----------------------------------------------------------------------------

create table public.conversation_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  session_id text not null,
  summary text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- workspace_event_types
-- -----------------------------------------------------------------------------

create table public.workspace_event_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  cal_event_type_id integer not null,
  slug text not null,
  title text not null,
  length_minutes integer not null check (length_minutes > 0),
  minimum_notice_minutes integer,
  is_ai_booking boolean not null default false,
  raw jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, cal_event_type_id),
  unique (workspace_id, slug)
);

create trigger workspace_event_types_updated_at
before update on public.workspace_event_types
for each row
execute function public.handle_updated_at();

create unique index workspace_event_types_one_ai_booking
  on public.workspace_event_types (workspace_id)
  where is_ai_booking = true;

comment on table public.workspace_event_types is
  'Cal.com event types mirrored per workspace; is_ai_booking marks the type used by chat agent';
comment on column public.workspace_event_types.is_ai_booking is
  'Exactly one true per workspace — used by check_availability / book_appointment';

-- -----------------------------------------------------------------------------
-- workspace_faq_items
-- -----------------------------------------------------------------------------

create table public.workspace_faq_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspace_faq_items_workspace_sort
  on public.workspace_faq_items (workspace_id, sort_order);

create trigger workspace_faq_items_updated_at
before update on public.workspace_faq_items
for each row
execute function public.handle_updated_at();

comment on table public.workspace_faq_items is 'Booking chat FAQ Q&A items per workspace';
comment on column public.workspace_faq_items.question is 'FAQ question shown to agent';
comment on column public.workspace_faq_items.answer is 'FAQ answer (markdown allowed)';
comment on column public.workspace_faq_items.sort_order is 'Display order within workspace (ascending)';

-- -----------------------------------------------------------------------------
-- agent_tool_events
-- -----------------------------------------------------------------------------

create table public.agent_tool_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  tool_name text not null,
  ok boolean not null default false,
  error text,
  session_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index agent_tool_events_workspace_created_idx
  on public.agent_tool_events (workspace_id, created_at desc);

create index agent_tool_events_workspace_ok_idx
  on public.agent_tool_events (workspace_id, ok, created_at desc)
  where ok = false;

comment on table public.agent_tool_events is
  'Agent tool success/failure events for Analytics AI health';

-- -----------------------------------------------------------------------------
-- chat_sessions / chat_messages
-- -----------------------------------------------------------------------------

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  eve_session_id text,
  visitor_id text,
  user_id uuid references auth.users (id) on delete set null,
  title text not null default 'Chat mới',
  status text not null default 'active'
    check (status in ('active', 'closed')),
  continuation_token text,
  stream_index integer not null default 0,
  events jsonb not null default '[]'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index chat_sessions_eve_session_id_uidx
  on public.chat_sessions (eve_session_id)
  where eve_session_id is not null;

create index chat_sessions_workspace_last_msg_idx
  on public.chat_sessions (workspace_id, last_message_at desc nulls last);

create index chat_sessions_visitor_idx
  on public.chat_sessions (visitor_id, last_message_at desc nulls last);

create index chat_sessions_user_idx
  on public.chat_sessions (user_id, last_message_at desc nulls last);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role text not null
    check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  eve_message_id text,
  eve_event_index integer,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

comment on table public.chat_sessions is
  'App-owned chat threads: Eve SessionState + events for resume; staff QA on dashboard';
comment on table public.chat_messages is
  'Projected transcript rows for dashboard / lightweight UI';

-- -----------------------------------------------------------------------------
-- notifications (final types + indexes + realtime)
-- -----------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  type text not null
    check (type in (
      'lead_new',
      'lead_urgent',
      'booking_created',
      'tool_error',
      'booking_mirror_failed',
      'booking_cancelled',
      'booking_rescheduled',
      'lead_stale',
      'ai_config'
    )),
  title text not null,
  body text not null default '',
  severity text not null default 'medium'
    check (severity in ('high', 'medium', 'low')),
  href text,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_workspace_created_idx
  on public.notifications (workspace_id, created_at desc);

create index notifications_workspace_unread_idx
  on public.notifications (workspace_id, created_at desc)
  where read_at is null;

create index notifications_debounce_idx
  on public.notifications (workspace_id, type, entity_id, created_at desc);

create index notifications_workspace_read_created_idx
  on public.notifications (workspace_id, read_at, created_at desc);

create index notifications_workspace_unread_created_id_idx
  on public.notifications (workspace_id, created_at desc, id desc)
  where read_at is null;

alter table public.notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication missing — skip';
end $$;

comment on table public.notifications is
  'In-app staff notifications for leads, bookings, sync changes, and AI config';

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;

-- Narrower grants where service_role owns writes for public chat / tools
grant select on public.chat_sessions to authenticated, service_role;
grant select on public.chat_messages to authenticated, service_role;
grant insert, update, delete on public.chat_sessions to service_role;
grant insert, update, delete on public.chat_messages to service_role;

grant select, update on public.notifications to authenticated, service_role;
grant insert, delete on public.notifications to service_role;

grant select, insert on public.agent_tool_events to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS (workspace-scoped)
-- Naming: Users can <action> workspace <table>
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.leads enable row level security;
alter table public.bookings enable row level security;
alter table public.conversation_logs enable row level security;
alter table public.workspace_event_types enable row level security;
alter table public.workspace_faq_items enable row level security;
alter table public.agent_tool_events enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;

-- profiles
create policy "Users can view own profile"
on public.profiles for select to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- workspaces
create policy "Users can read workspace workspaces"
on public.workspaces for select to authenticated
using (id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace workspaces"
on public.workspaces for update to authenticated
using (id in (select workspace_id from public.profiles where id = auth.uid()))
with check (id in (select workspace_id from public.profiles where id = auth.uid()));

-- leads
create policy "Users can read workspace leads"
on public.leads for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can insert workspace leads"
on public.leads for insert to authenticated
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace leads"
on public.leads for update to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- bookings
create policy "Users can read workspace bookings"
on public.bookings for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can insert workspace bookings"
on public.bookings for insert to authenticated
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace bookings"
on public.bookings for update to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- conversation_logs
create policy "Users can read workspace conversation_logs"
on public.conversation_logs for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- workspace_event_types
create policy "Users can read workspace workspace_event_types"
on public.workspace_event_types for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can insert workspace workspace_event_types"
on public.workspace_event_types for insert to authenticated
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace workspace_event_types"
on public.workspace_event_types for update to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can delete workspace workspace_event_types"
on public.workspace_event_types for delete to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- workspace_faq_items
create policy "Users can read workspace workspace_faq_items"
on public.workspace_faq_items for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can insert workspace workspace_faq_items"
on public.workspace_faq_items for insert to authenticated
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace workspace_faq_items"
on public.workspace_faq_items for update to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can delete workspace workspace_faq_items"
on public.workspace_faq_items for delete to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- agent_tool_events
create policy "Users can read workspace agent_tool_events"
on public.agent_tool_events for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- chat
create policy "Users can read workspace chat_sessions"
on public.chat_sessions for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can read workspace chat_messages"
on public.chat_messages for select to authenticated
using (
  session_id in (
    select id from public.chat_sessions
    where workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  )
);

-- notifications
create policy "Users can read workspace notifications"
on public.notifications for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace notifications"
on public.notifications for update to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));
