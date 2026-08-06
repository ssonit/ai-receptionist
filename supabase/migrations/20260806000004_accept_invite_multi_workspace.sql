-- Multi-workspace membership — phase 2.
--
-- Removes the already_in_workspace dead end. Anyone who signed up on their own
-- (and so was handed an auto-created workspace by handle_new_user) could never
-- afterwards be invited anywhere: accept_workspace_invite refused every
-- invitee who already had a workspace, with no recovery path in the UI.
--
-- Membership is no longer exclusive, so the correct question is not "does this
-- user have a workspace" but "is this user already in THIS workspace".
--
-- 20260726000001's guarantee is preserved and in fact strengthened: that
-- migration refused to move a user out of their existing workspace because
-- doing so had been silently deleting it. Nothing is moved or deleted here —
-- a membership is added alongside the existing one.

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into inv
  from public.workspace_invites
  where token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select email into user_email from auth.users where id = uid;

  if lower(trim(inv.email)) <> lower(trim(coalesce(user_email, ''))) then
    return jsonb_build_object(
      'ok', false,
      'error', 'email_mismatch',
      'inviteEmail', inv.email
    );
  end if;

  -- Already in THIS workspace: no-op, and deliberately do not consume the
  -- invite or touch the role (an owner clicking their own link must stay
  -- owner — the lockout fixed in 20260726000001).
  if exists (
    select 1 from public.workspace_members
    where user_id = uid and workspace_id = inv.workspace_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_member',
      'workspaceId', inv.workspace_id
    );
  end if;

  -- Additive: any existing membership is left exactly as it is.
  insert into public.workspace_members (user_id, workspace_id, role)
  values (uid, inv.workspace_id, inv.role);

  -- Make the freshly joined workspace the last-used one, so the user lands in
  -- it on the next page load even before the switcher writes its cookie.
  update public.profiles
  set workspace_id = inv.workspace_id,
      role = inv.role,
      updated_at = now()
  where id = uid;

  update public.workspace_invites
  set accepted_at = now(),
      accepted_by = uid
  where id = inv.id;

  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id);
end;
$$;

comment on function public.accept_workspace_invite(text) is
  'Adds a membership for the invited workspace. Membership is not exclusive: an existing membership elsewhere is left untouched. Returns already_member only when the caller is already in THIS workspace.';
