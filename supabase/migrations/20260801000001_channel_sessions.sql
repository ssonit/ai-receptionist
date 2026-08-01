-- channel + external_user_id for non-browser chat sessions (Messenger, Zalo, etc.)
alter table public.chat_sessions
  add column if not exists channel text,
  add column if not exists external_user_id text;

-- One session per (workspace_id, channel, external_user_id).
create unique index if not exists chat_sessions_channel_external_uidx
  on public.chat_sessions (workspace_id, channel, external_user_id)
  where channel is not null and external_user_id is not null;
