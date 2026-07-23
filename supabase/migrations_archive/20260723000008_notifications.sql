-- In-app staff notifications (workspace-scoped pilot)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  type text not null
    check (type in (
      'lead_new',
      'lead_urgent',
      'booking_created',
      'tool_error',
      'booking_mirror_failed'
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

create index if not exists notifications_workspace_created_idx
  on public.notifications (workspace_id, created_at desc);

create index if not exists notifications_workspace_unread_idx
  on public.notifications (workspace_id, created_at desc)
  where read_at is null;

create index if not exists notifications_debounce_idx
  on public.notifications (workspace_id, type, entity_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Authenticated can read notifications (pilot)"
on public.notifications
for select
to authenticated
using (true);

create policy "Authenticated can update notifications (pilot)"
on public.notifications
for update
to authenticated
using (true)
with check (true);

grant select, update on public.notifications to authenticated, service_role;
grant insert, delete on public.notifications to service_role;

comment on table public.notifications is
  'In-app staff notifications for leads, bookings, and AI tool errors';
