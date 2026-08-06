alter table public.chat_sessions
  add column if not exists guest_visible_after timestamptz;

comment on column public.chat_sessions.guest_visible_after is
  'Guest-facing message visibility watermark (soft restart hides older messages without deleting data).';
