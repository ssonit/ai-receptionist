-- Workspace invites hardening.
-- Fixes: owner self-demotion lockout, open (email-less) links, silent workspace
-- deletion. Adds member removal + ownership transfer.

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------

alter table public.workspace_invites
  add column if not exists accepted_by uuid references auth.users (id) on delete set null,
  add column if not exists last_sent_at timestamptz;

comment on column public.workspace_invites.accepted_by is
  'User who accepted this invite (audit trail).';
comment on column public.workspace_invites.last_sent_at is
  'Last time the invite email was sent — used to rate-limit resend.';

-- Open links (email is null) are removed: anyone holding the URL could join.
-- Accepted rows are history only; nothing references this table.
delete from public.workspace_invites where email is null;

alter table public.workspace_invites
  alter column email set not null;

comment on column public.workspace_invites.email is
  'Required. Only this address may accept — open links are not supported.';

-- -----------------------------------------------------------------------------
-- accept_workspace_invite — rewritten
--
-- Rules:
--   1. Never change the role of someone already in this workspace (Bug 1).
--   2. Never consume an invite meant for someone else.
--   3. Never delete the caller's existing workspace (Bug 4).
-- -----------------------------------------------------------------------------

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

  -- Email is NOT NULL now, so this check always runs.
  if lower(trim(inv.email)) <> lower(trim(coalesce(user_email, ''))) then
    return jsonb_build_object(
      'ok', false,
      'error', 'email_mismatch',
      'inviteEmail', inv.email
    );
  end if;

  select workspace_id into old_ws from public.profiles where id = uid;

  -- Already a member of THIS workspace: no-op.
  -- Critically: do NOT touch role (an owner clicking their own link must stay
  -- owner), and do NOT consume the invite (it may be meant for someone else
  -- who shares the address, and burning it helps nobody).
  if old_ws is not null and old_ws = inv.workspace_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_member',
      'workspaceId', inv.workspace_id
    );
  end if;

  -- Belongs to a different workspace: refuse. Never delete their data.
  if old_ws is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_workspace');
  end if;

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

grant execute on function public.accept_workspace_invite(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- remove_workspace_member — owner only, cannot remove an owner
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

  -- The only owner must never be removable: that would orphan the workspace.
  -- Transfer ownership first, then remove.
  if target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  -- Detach from the workspace; the auth account itself is untouched.
  update public.profiles
  set workspace_id = null,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_workspace_member(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- transfer_workspace_ownership — atomic swap, keeps exactly one owner
-- -----------------------------------------------------------------------------

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

  -- Promote first, then demote: at no instant does the workspace have zero owners.
  update public.profiles
  set role = 'owner', updated_at = now()
  where id = p_to_user_id;

  update public.profiles
  set role = 'staff', updated_at = now()
  where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.transfer_workspace_ownership(uuid) to authenticated, service_role;
