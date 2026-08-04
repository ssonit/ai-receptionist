-- `conversation_needs_reply` was added to NOTIFICATION_TYPES in
-- lib/notifications-write.ts without ever reaching this constraint, so every
-- insert of that type failed the check. createNotification() swallows its
-- errors and returns null, so staff simply never heard that a guest had
-- replied to a conversation they had taken over — on web, messenger and zalo
-- alike, with nothing in the logs but a create failed line.

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
    'booking_change_requested',
    'conversation_needs_reply'
  ));
