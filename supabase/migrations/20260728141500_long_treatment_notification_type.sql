-- Add explicit notification type for long-treatment staff handoff.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'lead_new',
    'lead_urgent',
    'long_treatment_requested',
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
