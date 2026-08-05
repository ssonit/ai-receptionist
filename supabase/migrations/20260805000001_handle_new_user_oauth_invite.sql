-- Google OAuth invite fallback.
--
-- handle_new_user only recognized invite_token in raw_user_meta_data. Google
-- (and any other OAuth provider) can't carry that — Supabase fills
-- raw_user_meta_data from the provider's own claims (name/email/picture),
-- not from our signInWithOAuth call. Without this, a brand-new OAuth signup
-- via an invite link always took the owner path and got its own throwaway
-- workspace instead of joining the invited one.
--
-- Fix: for OAuth signups only (raw_app_meta_data->>'provider' <> 'email'),
-- fall back to looking up a pending invite by the verified new.email.
-- Password signups are unaffected — they already pass invite_token
-- explicitly via signUp()'s `data` option (app/auth/actions.ts signUp()).
--
-- accept_workspace_invite() is intentionally NOT touched — see
-- 20260726000001_workspace_invites_hardening.sql ("never delete the
-- caller's existing workspace"). This migration avoids ever creating the
-- throwaway workspace in the first place, instead of reassigning it after
-- the fact.

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

  -- Explicit invite_token (password signup with ?invite=... already in the form).
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

    update public.workspace_invites
    set accepted_at = now()
    where id = inv.id;

    return new;
  end if;

  -- OAuth fallback: no invite_token metadata possible, so match by email instead.
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

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Invite token (explicit, or matched by email for OAuth signups) → staff joins existing workspace; else create an owner workspace (race-safe slug) and call seed_workspace_starters().';
