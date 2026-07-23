-- Multi-session chat transcripts for guest resume + staff QA

create table if not exists public.chat_sessions (
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

create unique index if not exists chat_sessions_eve_session_id_uidx
  on public.chat_sessions (eve_session_id)
  where eve_session_id is not null;

create index if not exists chat_sessions_workspace_last_msg_idx
  on public.chat_sessions (workspace_id, last_message_at desc nulls last);

create index if not exists chat_sessions_visitor_idx
  on public.chat_sessions (visitor_id, last_message_at desc nulls last);

create index if not exists chat_sessions_user_idx
  on public.chat_sessions (user_id, last_message_at desc nulls last);

create table if not exists public.chat_messages (
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

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "Authenticated can read chat sessions (pilot)"
on public.chat_sessions
for select
to authenticated
using (true);

create policy "Authenticated can read chat messages (pilot)"
on public.chat_messages
for select
to authenticated
using (true);

grant select on public.chat_sessions to authenticated, service_role;
grant select on public.chat_messages to authenticated, service_role;
grant insert, update, delete on public.chat_sessions to service_role;
grant insert, update, delete on public.chat_messages to service_role;

comment on table public.chat_sessions is
  'App-owned chat threads: Eve SessionState + events for resume; staff QA on dashboard';
comment on table public.chat_messages is
  'Projected transcript rows for dashboard / lightweight UI';
