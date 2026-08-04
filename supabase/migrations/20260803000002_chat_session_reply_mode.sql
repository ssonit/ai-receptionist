-- Who is answering a conversation, independent of whether it is open or closed.

alter table public.chat_sessions
  add column reply_mode text not null default 'ai'
    check (reply_mode in ('ai', 'human')),
  add column claimed_by uuid references auth.users (id) on delete set null,
  add column claimed_at timestamptz;

comment on column public.chat_sessions.reply_mode is
  'ai = the agent answers; human = a staff member has taken over';
comment on column public.chat_sessions.claimed_by is
  'Informational: who pressed Take over. Not a lock — teammates may still reply';

-- Serves the dashboard filter "conversations a human is handling", the only
-- query that selects on reply_mode.
create index chat_sessions_workspace_reply_mode_idx
  on public.chat_sessions (workspace_id, reply_mode)
  where reply_mode = 'human';
