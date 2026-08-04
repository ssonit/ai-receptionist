alter table public.bookings
  add column created_by_staff_id uuid references public.profiles(id) on delete set null;

comment on column public.bookings.created_by_staff_id is
  'Set when a staff member created this booking from the dashboard. Null means it came from the chat agent or was created directly in Cal.com.';
