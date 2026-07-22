-- Allow workspace members to update contact info and FAQ content

create policy "Users can update own workspace"
on public.workspaces
for update
to authenticated
using (
  id in (select workspace_id from public.profiles where id = auth.uid())
)
with check (
  id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can insert workspace faq"
on public.workspace_faq
for insert
to authenticated
with check (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can update workspace faq"
on public.workspace_faq
for update
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
)
with check (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);
