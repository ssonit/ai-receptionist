-- Multi-workspace membership — phase 1 of 2, step 1 of 3.
--
-- Introduces the join table and the read helpers. Nothing reads it yet:
-- policies still source membership from profiles until 20260806000003, and
-- the writing functions start dual-writing in 20260806000002. Applying this
-- migration alone changes no behaviour.
--
-- See docs/superpowers/specs/2026-08-06-multi-workspace-design.md

create table public.workspace_members (
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role         text not null default 'staff' check (role in ('owner','staff')),
  created_at   timestamptz not null default now(),
  -- user_id leads the PK deliberately. The RLS hot path filters
  -- `where user_id = auth.uid()` and runs on every query against every tenant
  -- table; a btree keyed (workspace_id, user_id) sorts by workspace first and
  -- cannot seek on user_id alone, degrading to a full index scan.
  primary key (user_id, workspace_id)
);

comment on table public.workspace_members is
  'Workspace membership + per-workspace role. Authoritative for RLS from 20260806000003 onward; profiles.workspace_id/role are kept in sync as last-used/legacy.';

comment on column public.workspace_members.role is
  'Role WITHIN this workspace. A user may be owner of one workspace and staff of another.';

-- Cold path: Settings -> Team lists the members of a single workspace.
create index workspace_members_workspace_idx
  on public.workspace_members (workspace_id);

alter table public.workspace_members enable row level security;

grant select on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;

-- Backfill. profiles.role is `not null default 'owner' check (role in
-- ('owner','staff'))`, so it is always a legal value here and needs no mapping.
insert into public.workspace_members (user_id, workspace_id, role)
select id, workspace_id, role
from public.profiles
where workspace_id is not null
on conflict (user_id, workspace_id) do nothing;

-- -----------------------------------------------------------------------------
-- Read helpers
-- -----------------------------------------------------------------------------
-- security definer for two reasons:
--   1. Recursion. A policy on workspace_members that asks "am I an owner of
--      this workspace?" must itself read workspace_members. A definer function
--      runs as the table owner and bypasses RLS, breaking the cycle. This is
--      the same reason current_user_workspace_id() was made definer in
--      20260724000008 ("Avoid RLS recursion when policies read profiles").
--   2. It skips a nested RLS evaluation on every check.
--
-- SECURITY DEFINER also prevents Postgres from inlining the function, so
-- ALWAYS call these as `x in (select public.fn())`. That form becomes an
-- InitPlan: evaluated once per statement instead of once per row — the same
-- technique 20260730000002 applied with (select auth.uid()).

create or replace function public.current_user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members
  where user_id = (select auth.uid())
$$;

comment on function public.current_user_workspace_ids() is
  'Every workspace the caller belongs to. Call as `x in (select public.current_user_workspace_ids())` so it evaluates once per statement.';

create or replace function public.current_user_owned_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members
  where user_id = (select auth.uid()) and role = 'owner'
$$;

comment on function public.current_user_owned_workspace_ids() is
  'Workspaces the caller owns. Replaces current_user_is_workspace_owner(), whose global boolean is meaningless once a user can be owner of one workspace and staff of another.';

grant execute on function public.current_user_workspace_ids() to authenticated, service_role;
grant execute on function public.current_user_owned_workspace_ids() to authenticated, service_role;

-- current_user_workspace_id() (singular) is deliberately left as-is. After
-- 20260806000003 no policy references it; it survives as the accessor for
-- "last-used workspace" (profiles.workspace_id).
comment on function public.current_user_workspace_id() is
  'LEGACY: the caller''s last-used workspace (profiles.workspace_id). Not a membership check — use current_user_workspace_ids() for that.';

-- -----------------------------------------------------------------------------
-- RLS on the membership table itself
-- -----------------------------------------------------------------------------

-- Read: teammates in any workspace I belong to. Goes through the definer
-- helper, so this policy does not recurse into workspace_members' own RLS.
create policy "Members can read memberships of their workspaces"
on public.workspace_members for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- No insert/update/delete policy for `authenticated`, on purpose. Every
-- membership write goes through a security definer RPC
-- (accept_workspace_invite / remove_workspace_member /
-- transfer_workspace_ownership), exactly how workspace_invites mutations are
-- already gated. Without this, any authenticated user could insert themselves
-- into any workspace.
