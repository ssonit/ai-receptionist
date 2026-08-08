-- Cal.com "Limit future bookings" (bookingWindow) mirrored per meeting type.
-- Shape: {"type":"calendarDays"|"businessDays","value":N,"rolling":bool}
--     or {"type":"range","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}
-- NULL = UNLIMITED (or not synced yet — readers fall back to `raw`).
alter table public.workspace_event_types
  add column if not exists booking_window jsonb;

comment on column public.workspace_event_types.booking_window is
  'Cal.com bookingWindow. NULL means unlimited or not yet synced.';
