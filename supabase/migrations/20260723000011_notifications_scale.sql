-- Scale helpers: unread list + retention purge

create index if not exists notifications_workspace_read_created_idx
  on public.notifications (workspace_id, read_at, created_at desc);

create index if not exists notifications_workspace_unread_created_id_idx
  on public.notifications (workspace_id, created_at desc, id desc)
  where read_at is null;
