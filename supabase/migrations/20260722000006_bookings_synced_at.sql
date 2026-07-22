alter table public.bookings
  add column if not exists synced_at timestamptz;

comment on column public.bookings.synced_at is 'Last time this row was mirrored from Cal.com';
