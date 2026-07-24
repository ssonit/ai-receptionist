-- Cursor pagination + upsert support for chat_messages

create unique index if not exists chat_messages_session_eve_id_uidx
  on public.chat_messages (session_id, eve_message_id)
  where eve_message_id is not null;

create index if not exists chat_messages_session_created_id_idx
  on public.chat_messages (session_id, created_at desc, id desc);
