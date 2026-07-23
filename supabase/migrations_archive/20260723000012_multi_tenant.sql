-- Multi-tenant: workspace slug, Cal API key encrypted, setup gate + RLS harden

alter table public.workspaces
  add column if not exists slug text,
  add column if not exists cal_api_key_encrypted text,
  add column if not exists setup_completed_at timestamptz;

-- Backfill pilot slug
update public.workspaces
set slug = 'eve-pilot'
where id = '00000000-0000-4000-8000-000000000001'
  and (slug is null or slug = '');

-- Unique slug (nullable allowed for legacy rows during migrate; new rows always set)
create unique index if not exists workspaces_slug_unique
  on public.workspaces (slug)
  where slug is not null;

-- Signup creates a new workspace (not pilot)
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

  base_slug := lower(regexp_replace(ws_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug is null or length(base_slug) < 2 then
    base_slug := 'ws';
  end if;
  base_slug := left(base_slug, 48);
  final_slug := base_slug;

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

-- Helper expression for policies
-- Drop pilot-open SELECT/UPDATE policies and replace with workspace-scoped ones

drop policy if exists "Authenticated can read leads (pilot)" on public.leads;
drop policy if exists "Authenticated can read bookings (pilot)" on public.bookings;
drop policy if exists "Authenticated can read conversation logs (pilot)" on public.conversation_logs;
drop policy if exists "Authenticated can read workspaces (pilot)" on public.workspaces;
drop policy if exists "Authenticated can insert leads (pilot)" on public.leads;
drop policy if exists "Authenticated can update leads (pilot)" on public.leads;
drop policy if exists "Authenticated can insert bookings (pilot)" on public.bookings;
drop policy if exists "Authenticated can update bookings (pilot)" on public.bookings;

drop policy if exists "Authenticated can read notifications (pilot)" on public.notifications;
drop policy if exists "Authenticated can update notifications (pilot)" on public.notifications;

drop policy if exists "Authenticated can read chat sessions (pilot)" on public.chat_sessions;
drop policy if exists "Authenticated can read chat messages (pilot)" on public.chat_messages;

drop policy if exists "Authenticated can read agent tool events (pilot)" on public.agent_tool_events;

drop policy if exists "Authenticated can read workspace faq items (pilot)" on public.workspace_faq_items;
drop policy if exists "Authenticated can read workspace event types (pilot)" on public.workspace_event_types;

do $$
begin
  if to_regclass('public.workspace_faq') is not null then
    execute 'drop policy if exists "Authenticated can read workspace faq (pilot)" on public.workspace_faq';
  end if;
end $$;

-- workspaces: keep own-read; add update own
drop policy if exists "Users can read own workspace" on public.workspaces;
create policy "Users can read own workspace"
on public.workspaces for select to authenticated
using (id in (select workspace_id from public.profiles where id = auth.uid()));

drop policy if exists "Users can update own workspace" on public.workspaces;
create policy "Users can update own workspace"
on public.workspaces for update to authenticated
using (id in (select workspace_id from public.profiles where id = auth.uid()))
with check (id in (select workspace_id from public.profiles where id = auth.uid()));

-- leads
drop policy if exists "Users can read workspace leads" on public.leads;
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
drop policy if exists "Users can read workspace bookings" on public.bookings;
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
drop policy if exists "Users can read workspace conversation logs" on public.conversation_logs;
create policy "Users can read workspace conversation logs"
on public.conversation_logs for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- notifications
create policy "Users can read workspace notifications"
on public.notifications for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can update workspace notifications"
on public.notifications for update to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
with check (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- chat
create policy "Users can read workspace chat sessions"
on public.chat_sessions for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

create policy "Users can read workspace chat messages"
on public.chat_messages for select to authenticated
using (
  session_id in (
    select id from public.chat_sessions
    where workspace_id in (select workspace_id from public.profiles where id = auth.uid())
  )
);

-- agent tool events
create policy "Users can read workspace agent tool events"
on public.agent_tool_events for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- faq items
create policy "Users can read workspace faq items"
on public.workspace_faq_items for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- event types
create policy "Users can read workspace event types"
on public.workspace_event_types for select to authenticated
using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()));

-- legacy workspace_faq table if still present
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'workspace_faq'
  ) then
    execute $p$
      create policy "Users can read own workspace faq"
      on public.workspace_faq for select to authenticated
      using (workspace_id in (select workspace_id from public.profiles where id = auth.uid()))
    $p$;
  end if;
exception when duplicate_object then null;
end $$;

comment on column public.workspaces.slug is 'Public chat tenant key (?w=slug)';
comment on column public.workspaces.cal_api_key_encrypted is 'AES-GCM encrypted Cal.com API key';
comment on column public.workspaces.setup_completed_at is 'Null until /dashboard/setup wizard finishes';
