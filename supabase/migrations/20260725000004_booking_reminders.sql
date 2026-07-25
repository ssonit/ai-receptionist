-- Outbound booking reminders + one-time manage links + guest opt-out.
-- Quiet hours use two smallints (int4range cannot represent overnight [21,8)).

-- -----------------------------------------------------------------------------
-- booking_reminders
-- -----------------------------------------------------------------------------

create table if not exists public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('reminder_24h', 'reminder_2h')),
  channel text not null default 'email',
  destination text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_reminders_unique unique (booking_id, kind, channel)
);

create index if not exists booking_reminders_due_idx
  on public.booking_reminders (status, scheduled_for)
  where status = 'pending';

create index if not exists booking_reminders_workspace_idx
  on public.booking_reminders (workspace_id, created_at desc);

alter table public.booking_reminders enable row level security;

create policy "Users can read workspace booking_reminders"
on public.booking_reminders
for select
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

grant select on public.booking_reminders to authenticated;
grant select, insert, update, delete on public.booking_reminders to service_role;

comment on table public.booking_reminders is
  'Outbound reminder sends per booking/kind. Writes are service_role (cron) only.';

-- -----------------------------------------------------------------------------
-- workspaces reminder settings (default OFF)
-- -----------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists booking_reminders_enabled boolean not null default false,
  add column if not exists reminder_lead_minutes integer[] not null default '{1440}',
  add column if not exists reminder_quiet_start smallint not null default 21
    check (reminder_quiet_start >= 0 and reminder_quiet_start <= 23),
  add column if not exists reminder_quiet_end smallint not null default 8
    check (reminder_quiet_end >= 0 and reminder_quiet_end <= 23),
  add column if not exists last_reminder_scan_at timestamptz;

comment on column public.workspaces.booking_reminders_enabled is
  'When false (default), cron does not schedule or send guest reminders.';
comment on column public.workspaces.reminder_lead_minutes is
  'Long-lead offsets in minutes before start (default 1440). Short lead is always guest_change_cutoff_minutes + 30 in app code.';
comment on column public.workspaces.reminder_quiet_start is
  'Local hour (0-23) when quiet hours begin. Overnight when start > end.';
comment on column public.workspaces.reminder_quiet_end is
  'Local hour (0-23) when quiet hours end (exclusive). Start==end disables quiet hours.';

-- -----------------------------------------------------------------------------
-- bookings opt-out
-- -----------------------------------------------------------------------------

alter table public.bookings
  add column if not exists reminders_opt_out boolean not null default false;

comment on column public.bookings.reminders_opt_out is
  'Guest opted out of booking reminders for this appointment.';

-- -----------------------------------------------------------------------------
-- booking_verifications.channel: manage_link (one-time magic link)
-- -----------------------------------------------------------------------------

alter table public.booking_verifications
  drop constraint if exists booking_verifications_channel_check;

alter table public.booking_verifications
  add constraint booking_verifications_channel_check
  check (channel in ('manage_code', 'email_otp', 'phone_last4', 'manage_link'));

create index if not exists booking_verifications_manage_link_idx
  on public.booking_verifications (code_hash)
  where channel = 'manage_link' and consumed_at is null;
