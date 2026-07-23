-- Mirror Cal.com event types per workspace; one may be marked for AI booking

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

-- At most one AI booking event type per workspace
create unique index workspace_event_types_one_ai_booking
  on public.workspace_event_types (workspace_id)
  where is_ai_booking = true;

alter table public.workspace_event_types enable row level security;

create policy "Authenticated can read workspace event types (pilot)"
on public.workspace_event_types
for select
to authenticated
using (true);

create policy "Users can insert workspace event types"
on public.workspace_event_types
for insert
to authenticated
with check (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can update workspace event types"
on public.workspace_event_types
for update
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
)
with check (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can delete workspace event types"
on public.workspace_event_types
for delete
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

comment on table public.workspace_event_types is
  'Cal.com event types mirrored per workspace; is_ai_booking marks the type used by chat agent';
comment on column public.workspace_event_types.is_ai_booking is
  'Exactly one true per workspace — used by check_availability / book_appointment';
grant select, insert, update, delete on public.workspace_event_types
  to anon, authenticated, service_role;
