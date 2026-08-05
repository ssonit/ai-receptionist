-- Pending-invite lookup by the caller's own verified email — lets an
-- existing user see (and accept) an invite without needing the emailed
-- link, mirroring get_workspace_invite_preview's security-definer pattern.
-- Does not touch accept_workspace_invite.

create or replace function public.list_my_pending_invites()
returns table (
  token text,
  workspace_name text,
  inviter_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    return;
  end if;

  select email into user_email from auth.users where id = uid;
  if user_email is null then
    return;
  end if;

  return query
  select
    wi.token,
    coalesce(w.name, 'Workspace') as workspace_name,
    nullif(trim(coalesce(p.full_name, p.email, '')), '') as inviter_name,
    wi.expires_at
  from public.workspace_invites wi
  join public.workspaces w on w.id = wi.workspace_id
  left join public.profiles p on p.id = wi.invited_by
  where lower(wi.email) = lower(user_email)
    and wi.accepted_at is null
    and wi.expires_at > now()
  order by wi.created_at desc;
end;
$$;

grant execute on function public.list_my_pending_invites() to authenticated;
