-- Vietnamese-aware workspace slugify (≈ npm slugify locale=vi) + handle_new_user
--
-- KEEP IN SYNC with lib/workspace.ts → slugifyWorkspaceName().
-- Both SQL + TS must exist: trigger cannot call Next.js; live preview cannot round-trip DB.
-- Collision: signup auto-dedupes (-1, -2…); Settings rejects duplicates.

create extension if not exists unaccent with schema extensions;

create or replace function public.slugify_workspace_name(input text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  s text;
begin
  -- Mirror npm slugify({ lower, strict, locale: 'vi', trim }) + lib/workspace.ts wrapper.
  s := lower(trim(coalesce(input, '')));
  -- Common symbol map (slugify charmap defaults)
  s := replace(s, '&', ' and ');
  s := replace(s, '@', ' at ');
  -- đ/Đ: belt-and-suspenders (unaccent usually maps these too; locale vi requires d)
  s := replace(replace(s, 'đ', 'd'), 'Đ', 'd');
  s := extensions.unaccent(s);
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := trim(both '-' from s);
  s := regexp_replace(s, '-{2,}', '-', 'g');
  if s is null or length(s) < 2 then
    return 'ws';
  end if;
  return left(s, 48);
end;
$$;

comment on function public.slugify_workspace_name(text) is
  'Booking URL slug ≈ npm slugify locale=vi. KEEP IN SYNC with lib/workspace.ts slugifyWorkspaceName(). Signup auto-dedupes (-1,-2); Settings rejects collisions.';

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
begin
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

  -- Signup: silent auto-dedupe (-1, -2…). Settings rejects collisions instead.
  while exists (select 1 from public.workspaces where slug = final_slug) loop
    n := n + 1;
    final_slug := left(base_slug, 40) || '-' || n::text;
  end loop;

  insert into public.workspaces (name, slug, timezone)
  values (ws_name, final_slug, 'Asia/Ho_Chi_Minh')
  returning id into ws_id;

  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'owner'),
    ws_id
  );

  return new;
end;
$$;
