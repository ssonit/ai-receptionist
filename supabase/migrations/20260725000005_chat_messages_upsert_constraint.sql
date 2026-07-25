-- PostgREST upsert ON CONFLICT cannot target a partial unique index.
-- Replace with a full UNIQUE constraint (NULLs in eve_message_id still allowed).

drop index if exists public.chat_messages_session_eve_id_uidx;

alter table public.chat_messages
  drop constraint if exists chat_messages_session_eve_id_key;

alter table public.chat_messages
  add constraint chat_messages_session_eve_id_key
  unique (session_id, eve_message_id);
