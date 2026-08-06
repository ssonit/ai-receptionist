-- Multi-workspace membership — phase 1 of 2, step 2 of 3.
--
-- The four functions that create or move a membership now write BOTH
-- workspace_members (authoritative from the next migration) and the legacy
-- profiles.workspace_id / profiles.role, so the two never disagree.
--
-- This must land BEFORE 20260806000003 repoints the policies. The other order
-- leaves a window where a new signup has a profile but no membership row, and
-- therefore no access to anything.
--
-- Behaviour is otherwise unchanged. In particular accept_workspace_invite
-- still rejects already_in_workspace — lifting that is Phase 2.

-- -----------------------------------------------------------------------------
-- handle_new_user — body from 20260805000001, plus membership inserts
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
  base_slug text;
  final_slug text;
  ws_name text;
  n int := 0;
  invite_token text;
  inv public.workspace_invites%rowtype;
  profile_role text;
  is_oauth boolean;
begin
  invite_token := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '');
  is_oauth := coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'email';

  -- Explicit invite_token (password signup arriving from ?invite=...).
  if invite_token is not null then
    select * into inv
    from public.workspace_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'Invalid or expired invite token';
    end if;

    if inv.email is not null
       and lower(trim(inv.email)) <> lower(trim(coalesce(new.email, ''))) then
      raise exception 'Invite email does not match signup email';
    end if;

    insert into public.profiles (id, email, full_name, role, workspace_id)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      inv.role,
      inv.workspace_id
    );

    insert into public.workspace_members (user_id, workspace_id, role)
    values (new.id, inv.workspace_id, inv.role)
    on conflict (user_id, workspace_id) do update set role = excluded.role;

    update public.workspace_invites
    set accepted_at = now()
    where id = inv.id;

    return new;
  end if;

  -- OAuth fallback: Google cannot carry invite_token, so match by email.
  if is_oauth then
    select * into inv
    from public.workspace_invites
    where lower(email) = lower(coalesce(new.email, ''))
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
    limit 1
    for update;

    if found then
      insert into public.profiles (id, email, full_name, role, workspace_id)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        inv.role,
        inv.workspace_id
      );

      insert into public.workspace_members (user_id, workspace_id, role)
      values (new.id, inv.workspace_id, inv.role)
      on conflict (user_id, workspace_id) do update set role = excluded.role;

      update public.workspace_invites
      set accepted_at = now()
      where id = inv.id;

      return new;
    end if;
  end if;

  -- Owner path: create a workspace.
  ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'workspace_name', '')), '');
  if ws_name is null then
    ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  end if;
  if ws_name is null then
    ws_name := split_part(coalesce(new.email, 'workspace'), '@', 1);
  end if;
  if ws_name is null or length(ws_name) < 1 then
    ws_name := 'Workspace';
  end if;

  base_slug := public.slugify_workspace_name(ws_name);
  final_slug := base_slug;

  loop
    begin
      insert into public.workspaces (name, slug, timezone)
      values (ws_name, final_slug, 'Asia/Ho_Chi_Minh')
      returning id into ws_id;
      exit;
    exception when unique_violation then
      n := n + 1;
      if n > 50 then
        raise exception 'Could not allocate a workspace slug for "%"', base_slug;
      end if;
      final_slug := left(base_slug, 40) || '-' || n::text;
    end;
  end loop;

  perform public.seed_workspace_starters(ws_id);

  profile_role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'owner');
  if profile_role not in ('owner', 'staff') then
    profile_role := 'owner';
  end if;

  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    profile_role,
    ws_id
  );

  insert into public.workspace_members (user_id, workspace_id, role)
  values (new.id, ws_id, profile_role)
  on conflict (user_id, workspace_id) do update set role = excluded.role;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Invite token (explicit, or matched by email for OAuth signups) -> staff joins existing workspace; else create an owner workspace. Writes both workspace_members and legacy profiles columns.';

-- -----------------------------------------------------------------------------
-- accept_workspace_invite — body from 20260726000001, plus membership insert
-- -----------------------------------------------------------------------------
-- The already_in_workspace rejection is intentionally preserved. Phase 2
-- replaces it; changing it here would defeat the point of a no-op refactor.

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
  old_ws uuid;
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

  select workspace_id into old_ws from public.profiles where id = uid;

  if old_ws is not null and old_ws = inv.workspace_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_member',
      'workspaceId', inv.workspace_id
    );
  end if;

  if old_ws is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_workspace');
  end if;

  update public.profiles
  set workspace_id = inv.workspace_id,
      role = inv.role,
      updated_at = now()
  where id = uid;

  insert into public.workspace_members (user_id, workspace_id, role)
  values (uid, inv.workspace_id, inv.role)
  on conflict (user_id, workspace_id) do update set role = excluded.role;

  update public.workspace_invites
  set accepted_at = now(),
      accepted_by = uid
  where id = inv.id;

  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- remove_workspace_member — body from 20260726000001, plus membership delete
-- -----------------------------------------------------------------------------

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
  target_ws uuid;
  target_role text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select workspace_id, role into caller_ws, caller_role
  from public.profiles where id = uid;

  if caller_ws is null or caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select workspace_id, role into target_ws, target_role
  from public.profiles where id = p_user_id;

  if target_ws is null or target_ws <> caller_ws then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  delete from public.workspace_members
  where user_id = p_user_id and workspace_id = caller_ws;

  update public.profiles
  set workspace_id = null,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- transfer_workspace_ownership — body from 20260726000001, plus membership swap
-- -----------------------------------------------------------------------------
-- Promote-then-demote order is preserved so the workspace is never ownerless.
-- (This is also why no partial unique index enforces one-owner-per-workspace:
-- the intermediate state legitimately has two owners and a unique index cannot
-- be deferred. See the spec's rejected-alternatives table.)

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
  target_ws uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_to_user_id = uid then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  select workspace_id, role into caller_ws, caller_role
  from public.profiles where id = uid for update;

  if caller_ws is null or caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select workspace_id into target_ws
  from public.profiles where id = p_to_user_id for update;

  if target_ws is null or target_ws <> caller_ws then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.profiles
  set role = 'owner', updated_at = now()
  where id = p_to_user_id;

  update public.workspace_members
  set role = 'owner'
  where user_id = p_to_user_id and workspace_id = caller_ws;

  update public.profiles
  set role = 'staff', updated_at = now()
  where id = uid;

  update public.workspace_members
  set role = 'staff'
  where user_id = uid and workspace_id = caller_ws;

  return jsonb_build_object('ok', true);
end;
$$;
