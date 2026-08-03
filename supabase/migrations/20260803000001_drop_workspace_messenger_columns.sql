-- Drop legacy Messenger columns on public.workspaces.
-- Credentials live in public.workspace_channel_connections
-- (see 20260802000002_channel_connections.sql backfill).
-- Apply only after app code no longer dual-writes / reads these columns.
alter table public.workspaces
  drop column if exists messenger_page_id,
  drop column if exists messenger_page_name,
  drop column if exists messenger_page_access_token_encrypted;
