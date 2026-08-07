-- Bỏ hệ thống reminder tự xây — Cal.com Workflow đảm nhiệm việc nhắc lịch
-- (quyết định 2026-08-07, xem docs/superpowers/specs/2026-08-07-drop-custom-reminders-design.md).

drop table if exists public.booking_reminders;

alter table public.workspaces
  drop column if exists booking_reminders_enabled,
  drop column if exists reminder_lead_minutes,
  drop column if exists reminder_quiet_start,
  drop column if exists reminder_quiet_end,
  drop column if exists last_reminder_scan_at;

alter table public.bookings
  drop column if exists reminders_opt_out;
