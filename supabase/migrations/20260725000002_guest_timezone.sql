-- Guest timezone: service mode + remember guest IANA tz on book/session.
-- Default onsite so existing local businesses keep current UX (no tz questions).

alter table public.workspaces
  add column if not exists service_mode text not null default 'onsite';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspaces_service_mode_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_service_mode_check
      check (service_mode in ('onsite', 'online'));
  end if;
end $$;

comment on column public.workspaces.service_mode is
  'onsite = in-person (do not ask guest timezone); online = remote (detect/ask guest timezone)';

alter table public.bookings
  add column if not exists guest_timezone text;

comment on column public.bookings.guest_timezone is
  'IANA timezone the guest saw at booking time (display history only; start_time remains UTC)';

alter table public.chat_sessions
  add column if not exists guest_timezone text;

comment on column public.chat_sessions.guest_timezone is
  'IANA timezone remembered for this chat session (set by set_guest_timezone or browser header)';
