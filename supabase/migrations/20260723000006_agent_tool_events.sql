-- Tool outcomes for Analytics / AI health alerts

create table if not exists public.agent_tool_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  tool_name text not null,
  ok boolean not null default false,
  error text,
  session_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_tool_events_workspace_created_idx
  on public.agent_tool_events (workspace_id, created_at desc);

create index if not exists agent_tool_events_workspace_ok_idx
  on public.agent_tool_events (workspace_id, ok, created_at desc)
  where ok = false;

alter table public.agent_tool_events enable row level security;

create policy "Authenticated can read agent tool events (pilot)"
on public.agent_tool_events
for select
to authenticated
using (true);

create policy "Service role inserts via admin client — allow authenticated insert (pilot)"
on public.agent_tool_events
for insert
to authenticated
with check (true);

grant select, insert on public.agent_tool_events to authenticated, service_role;

comment on table public.agent_tool_events is
  'Agent tool success/failure events for Analytics AI health';
