-- Multi-workspace / restart follow-up: leads and agent_tool_events get the
-- same stable-join-key fix already applied to bookings in
-- lib/conversations-dashboard.ts (5f60d86).
--
-- Both tables only ever recorded `session_id` (the eve/LLM runtime session
-- id). restartGuestChatSession() nulls chat_sessions.eve_session_id by
-- design (fresh LLM continuation), which orphaned any lead or tool-error
-- event created before a guest clicked "Restart" — the dashboard's
-- has_lead/has_tool_error joins on the CURRENT eve_session_id, which no
-- longer matches what was stored at write time.
--
-- chat_session_id is the same fix bookings already has (added in
-- 20260725000001): stable across restart, because restart never touches
-- chat_sessions.id.

alter table public.leads
  add column if not exists chat_session_id uuid
    references public.chat_sessions (id) on delete set null;

alter table public.agent_tool_events
  add column if not exists chat_session_id uuid
    references public.chat_sessions (id) on delete set null;

comment on column public.leads.chat_session_id is
  'Stable chat_sessions.id — survives a guest "Restart" (which nulls chat_sessions.eve_session_id). Prefer this over session_id for dashboard joins.';

comment on column public.agent_tool_events.chat_session_id is
  'Stable chat_sessions.id — survives a guest "Restart" (which nulls chat_sessions.eve_session_id). Prefer this over session_id for dashboard joins.';

create index if not exists leads_chat_session_idx
  on public.leads (chat_session_id)
  where chat_session_id is not null;

create index if not exists agent_tool_events_chat_session_idx
  on public.agent_tool_events (chat_session_id)
  where chat_session_id is not null;
