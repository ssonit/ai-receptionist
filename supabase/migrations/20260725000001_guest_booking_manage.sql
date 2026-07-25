-- Guest booking change: ownership columns, manage codes, verifications, workspace policy.
-- Source: docs/superpowers/guest-booking-change.md
-- RLS: booking_verifications = service_role only (secrets). No anon/authenticated policies.

-- -----------------------------------------------------------------------------
-- bookings: anonymous owner + manage code
-- -----------------------------------------------------------------------------

alter table public.bookings
  add column if not exists visitor_id text,
  add column if not exists chat_session_id uuid references public.chat_sessions (id) on delete set null,
  add column if not exists manage_code_hash text,
  add column if not exists cancelled_by text
    check (cancelled_by is null or cancelled_by in ('guest', 'owner', 'cal'));

create index if not exists bookings_visitor_idx
  on public.bookings (workspace_id, visitor_id)
  where visitor_id is not null;

create index if not exists bookings_chat_session_idx
  on public.bookings (workspace_id, chat_session_id)
  where chat_session_id is not null;

comment on column public.bookings.visitor_id is
  'eve_visitor_id cookie at booking time — for A2 claim across chat sessions';
comment on column public.bookings.chat_session_id is
  'Supabase chat_sessions.id when booked — A1 claim';
comment on column public.bookings.manage_code_hash is
  'sha256 hash of 6-char manage code; plaintext only returned once at book';
comment on column public.bookings.cancelled_by is
  'Who cancelled: guest | owner | cal (sync)';

-- -----------------------------------------------------------------------------
-- workspaces: guest self-serve policy
-- -----------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists guest_cancel_enabled boolean not null default true,
  add column if not exists guest_reschedule_enabled boolean not null default true,
  add column if not exists guest_change_cutoff_minutes integer not null default 120;

comment on column public.workspaces.guest_cancel_enabled is
  'Allow guests to cancel via chat when ownership proven';
comment on column public.workspaces.guest_reschedule_enabled is
  'Allow guests to reschedule via chat when ownership proven';
comment on column public.workspaces.guest_change_cutoff_minutes is
  'Minimum minutes before start that guest may cancel/reschedule';

-- -----------------------------------------------------------------------------
-- booking_verifications (manage code / OTP / phone_last4) — service_role only
-- -----------------------------------------------------------------------------

create table if not exists public.booking_verifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  chat_session_id uuid references public.chat_sessions (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  channel text not null
    check (channel in ('manage_code', 'email_otp', 'phone_last4')),
  destination text,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  verified_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists booking_verifications_session_idx
  on public.booking_verifications (chat_session_id, created_at desc);

create index if not exists booking_verifications_dest_idx
  on public.booking_verifications (workspace_id, destination, created_at desc)
  where destination is not null;

comment on table public.booking_verifications is
  'Short-lived proof codes for guest booking change. Service-role only — no client RLS policies.';

alter table public.booking_verifications enable row level security;

-- Intentionally NO policies for anon/authenticated (secret hashes).
grant select, insert, update, delete on public.booking_verifications to service_role;

-- -----------------------------------------------------------------------------
-- notifications.type: guest change events
-- -----------------------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'lead_new',
    'lead_urgent',
    'booking_created',
    'tool_error',
    'booking_mirror_failed',
    'booking_cancelled',
    'booking_rescheduled',
    'lead_stale',
    'ai_config',
    'booking_cancelled_by_guest',
    'booking_rescheduled_by_guest',
    'booking_change_requested'
  ));

-- -----------------------------------------------------------------------------
-- Backfill: map bookings.session_id (eve) → chat_sessions
-- -----------------------------------------------------------------------------

update public.bookings b
set
  visitor_id = coalesce(b.visitor_id, cs.visitor_id),
  chat_session_id = coalesce(b.chat_session_id, cs.id)
from public.chat_sessions cs
where b.session_id is not null
  and cs.eve_session_id = b.session_id
  and b.workspace_id is not null
  and cs.workspace_id = b.workspace_id
  and (b.visitor_id is null or b.chat_session_id is null);
