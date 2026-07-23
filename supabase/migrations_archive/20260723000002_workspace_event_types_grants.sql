-- Grants for workspace_event_types (idempotent if already applied)

grant select, insert, update, delete on public.workspace_event_types
  to anon, authenticated, service_role;
