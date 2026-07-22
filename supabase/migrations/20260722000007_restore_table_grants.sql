-- Restore API role privileges (anon / authenticated / service_role).
-- Local DB somehow lost SELECT/INSERT/UPDATE/DELETE on public tables,
-- which surfaces as: permission denied for table bookings

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;

-- Pilot write policies for bookings (agent sync + dashboard sync button)
create policy "Authenticated can insert bookings (pilot)"
on public.bookings
for insert
to authenticated
with check (true);

create policy "Authenticated can update bookings (pilot)"
on public.bookings
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated can insert leads (pilot)"
on public.leads
for insert
to authenticated
with check (true);

create policy "Authenticated can update leads (pilot)"
on public.leads
for update
to authenticated
using (true)
with check (true);
