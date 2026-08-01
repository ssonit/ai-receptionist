-- Messenger (Facebook) OAuth per workspace.
alter table public.workspaces
  add column if not exists messenger_page_id text,
  add column if not exists messenger_page_name text,
  add column if not exists messenger_page_access_token_encrypted text;
