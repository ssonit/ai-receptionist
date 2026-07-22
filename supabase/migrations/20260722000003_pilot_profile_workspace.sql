-- Attach new profiles to the pilot workspace by default
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'owner'),
    '00000000-0000-4000-8000-000000000001'
  );
  return new;
end;
$$;

-- Pilot convenience: authenticated users can read all leads/bookings/logs
create policy "Authenticated can read leads (pilot)"
on public.leads
for select
to authenticated
using (true);

create policy "Authenticated can read bookings (pilot)"
on public.bookings
for select
to authenticated
using (true);

create policy "Authenticated can read conversation logs (pilot)"
on public.conversation_logs
for select
to authenticated
using (true);

create policy "Authenticated can read workspaces (pilot)"
on public.workspaces
for select
to authenticated
using (true);
