-- Normalised per-workspace messaging channel credentials.
-- Replaces the messenger_* columns on public.workspaces (dropped in a
-- follow-up migration once this path has shipped).
create table if not exists public.workspace_channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('messenger', 'zalo')),
  external_id text not null,
  display_name text,
  access_encrypted text,
  refresh_encrypted text,
  expires_at timestamptz,
  refresh_lock_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One connection per provider per workspace: two OAs on one workspace would
-- make "which one replies" undefined.
create unique index if not exists wcc_workspace_provider_uidx
  on public.workspace_channel_connections (workspace_id, provider);

-- Tenant isolation: one external account maps to exactly one workspace, so
-- webhook resolution by external_id can never be ambiguous.
create unique index if not exists wcc_provider_external_uidx
  on public.workspace_channel_connections (provider, external_id);

-- This table stores secrets. RLS is enabled with NO policies for
-- `authenticated` — every read goes through the service-role client in
-- server-side code that has already resolved the caller's workspace.
alter table public.workspace_channel_connections enable row level security;

-- Backfill existing Messenger connections.
insert into public.workspace_channel_connections
  (workspace_id, provider, external_id, display_name, access_encrypted)
select distinct on (messenger_page_id)
       id,
       'messenger',
       messenger_page_id,
       messenger_page_name,
       messenger_page_access_token_encrypted
  from public.workspaces
 where messenger_page_id is not null
 order by messenger_page_id, updated_at desc
on conflict (workspace_id, provider) do nothing;
