-- Multi-workspace Phase 2 follow-up (Task 6 audit).
--
-- remove_workspace_member / transfer_workspace_ownership still keyed off
-- profiles.workspace_id for both caller and target. After multi-membership,
-- profiles.workspace_id is only last-used — a staff member whose last-used
-- points elsewhere would be invisible to remove/transfer, and remove would
-- null their profile even when they still belong to another workspace.
--
-- Both functions now authorise and target via workspace_members. The caller's
-- active workspace is still read from profiles.workspace_id (kept in sync by
-- the switcher / accept_invite), matching getActiveWorkspace's last-used
-- fallback when no cookie is present on the SQL path.

create or replace function public.remove_workspace_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_ws uuid;
  caller_role text;
  target_role text;
  next_ws uuid;
  next_role text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select workspace_id into caller_ws
  from public.profiles where id = uid;

  if caller_ws is null then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select role into caller_role
  from public.workspace_members
  where user_id = uid and workspace_id = caller_ws;

  if caller_role is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select role into target_role
  from public.workspace_members
  where user_id = p_user_id and workspace_id = caller_ws;

  if target_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  delete from public.workspace_members
  where user_id = p_user_id and workspace_id = caller_ws;

  -- Only rewrite last-used when it pointed at the workspace we just left.
  -- Other memberships must stay intact (spec acceptance #9).
  if exists (
    select 1 from public.profiles
    where id = p_user_id and workspace_id = caller_ws
  ) then
    select workspace_id, role into next_ws, next_role
    from public.workspace_members
    where user_id = p_user_id
    order by created_at
    limit 1;

    update public.profiles
    set workspace_id = next_ws,
        role = coalesce(next_role, role),
        updated_at = now()
    where id = p_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.remove_workspace_member(uuid) is
  'Owner of the active (last-used) workspace removes one membership. Other memberships and an unrelated profiles.workspace_id are left untouched.';

create or replace function public.transfer_workspace_ownership(p_to_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_ws uuid;
  caller_role text;
  target_role text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_to_user_id = uid then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  select workspace_id into caller_ws
  from public.profiles where id = uid for update;

  if caller_ws is null then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select role into caller_role
  from public.workspace_members
  where user_id = uid and workspace_id = caller_ws
  for update;

  if caller_role is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select role into target_role
  from public.workspace_members
  where user_id = p_to_user_id and workspace_id = caller_ws
  for update;

  if target_role is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Promote-then-demote so the workspace is never ownerless.
  update public.workspace_members
  set role = 'owner'
  where user_id = p_to_user_id and workspace_id = caller_ws;

  update public.profiles
  set role = 'owner', updated_at = now()
  where id = p_to_user_id and workspace_id = caller_ws;

  update public.workspace_members
  set role = 'staff'
  where user_id = uid and workspace_id = caller_ws;

  update public.profiles
  set role = 'staff', updated_at = now()
  where id = uid and workspace_id = caller_ws;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.transfer_workspace_ownership(uuid) is
  'Swaps ownership inside the caller''s active workspace via workspace_members. Target membership is required even if their profiles.workspace_id points elsewhere.';
