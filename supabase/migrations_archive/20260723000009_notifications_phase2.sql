-- Phase 2 notification types: Cal cancel/reschedule, stale leads, AI config

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
    'ai_config'
  ));

comment on table public.notifications is
  'In-app staff notifications for leads, bookings, sync changes, and AI config';
