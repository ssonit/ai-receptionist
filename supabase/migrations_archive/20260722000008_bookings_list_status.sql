-- Cal.com list filter bucket from GET /v2/bookings?status=
-- Values: upcoming | unconfirmed | recurring | past | cancelled
-- @see https://cal.com/docs/api-reference/v2/bookings/get-all-bookings

alter table public.bookings
  add column if not exists list_status text;

comment on column public.bookings.list_status is
  'Cal.com list filter at last sync (upcoming|unconfirmed|recurring|past|cancelled)';

comment on column public.bookings.status is
  'Cal.com booking lifecycle: accepted|pending|cancelled|rejected';
