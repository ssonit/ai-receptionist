-- RLS InitPlan + index hygiene.
--
-- 1. Wrap auth.uid() as (select auth.uid()) so Postgres evaluates it once per
--    statement (InitPlan) instead of once per row. Supabase Performance
--    Advisor flags the unwrapped form as `auth_rls_initplan`.
--    Tenant scoping logic is UNCHANGED — same workspace_id subquery, no
--    `using (true)` anywhere.
-- 2. Add the missing tenant indexes for bookings + conversation_logs.
-- 3. Drop two indexes that are strict subsets of another index on the same
--    table (verified against every call site in lib/).
--
-- Deliberately NOT dropping notifications_workspace_read_created_idx or
-- notifications_workspace_created_idx — both still serve the "unread first"
-- listing path in lib/notifications.ts:113-120. Verify with EXPLAIN before
-- touching those.

-- -----------------------------------------------------------------------------
-- Helper functions used by invite / teammate policies
-- -----------------------------------------------------------------------------

create or replace function public.current_user_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = (select auth.uid())
$$;

create or replace function public.current_user_is_workspace_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'owner'
      and workspace_id is not null
  )
$$;

-- -----------------------------------------------------------------------------
-- Tenant indexes
-- -----------------------------------------------------------------------------

-- bookings had only partial indexes (visitor_id / chat_session_id guest-claim);
-- nothing served the dashboard's "this workspace, newest first" read.
create index if not exists bookings_workspace_start_idx
  on public.bookings (workspace_id, start_time desc);

-- conversation_logs had no index at all beyond the primary key, so every
-- RLS-filtered read was a seq scan.
create index if not exists conversation_logs_workspace_idx
  on public.conversation_logs (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Redundant indexes
-- -----------------------------------------------------------------------------

-- Same partial predicate (read_at is null) and same leading columns as
-- notifications_workspace_unread_created_id_idx, which additionally carries
-- `id desc` — a strict superset. lib/notifications.ts always orders unread-only
-- listings by (created_at desc, id desc), matching the surviving index exactly.
drop index if exists public.notifications_workspace_unread_idx;

-- Covered by chat_messages_session_created_id_idx (session_id, created_at desc,
-- id desc). The only ascending reader (lib/chat-sessions.ts:350) is served by a
-- backward btree scan — Postgres walks a btree in either direction, so a
-- separate ASC index buys nothing.
drop index if exists public.chat_messages_session_created_idx;

-- -----------------------------------------------------------------------------
-- Recreate policies with (select auth.uid())
-- -----------------------------------------------------------------------------

-- profiles
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- workspaces
drop policy if exists "Users can read workspace workspaces" on public.workspaces;
create policy "Users can read workspace workspaces"
on public.workspaces for select to authenticated
using (
  id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can update workspace workspaces" on public.workspaces;
create policy "Users can update workspace workspaces"
on public.workspaces for update to authenticated
using (
  id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
)
with check (
  id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- leads
drop policy if exists "Users can read workspace leads" on public.leads;
create policy "Users can read workspace leads"
on public.leads for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can insert workspace leads" on public.leads;
create policy "Users can insert workspace leads"
on public.leads for insert to authenticated
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can update workspace leads" on public.leads;
create policy "Users can update workspace leads"
on public.leads for update to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
)
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- bookings
drop policy if exists "Users can read workspace bookings" on public.bookings;
create policy "Users can read workspace bookings"
on public.bookings for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can insert workspace bookings" on public.bookings;
create policy "Users can insert workspace bookings"
on public.bookings for insert to authenticated
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can update workspace bookings" on public.bookings;
create policy "Users can update workspace bookings"
on public.bookings for update to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
)
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- conversation_logs
drop policy if exists "Users can read workspace conversation_logs"
  on public.conversation_logs;
create policy "Users can read workspace conversation_logs"
on public.conversation_logs for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- workspace_event_types
drop policy if exists "Users can read workspace workspace_event_types"
  on public.workspace_event_types;
create policy "Users can read workspace workspace_event_types"
on public.workspace_event_types for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can insert workspace workspace_event_types"
  on public.workspace_event_types;
create policy "Users can insert workspace workspace_event_types"
on public.workspace_event_types for insert to authenticated
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can update workspace workspace_event_types"
  on public.workspace_event_types;
create policy "Users can update workspace workspace_event_types"
on public.workspace_event_types for update to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
)
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can delete workspace workspace_event_types"
  on public.workspace_event_types;
create policy "Users can delete workspace workspace_event_types"
on public.workspace_event_types for delete to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- workspace_faq_items
drop policy if exists "Users can read workspace workspace_faq_items"
  on public.workspace_faq_items;
create policy "Users can read workspace workspace_faq_items"
on public.workspace_faq_items for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can insert workspace workspace_faq_items"
  on public.workspace_faq_items;
create policy "Users can insert workspace workspace_faq_items"
on public.workspace_faq_items for insert to authenticated
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can update workspace workspace_faq_items"
  on public.workspace_faq_items;
create policy "Users can update workspace workspace_faq_items"
on public.workspace_faq_items for update to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
)
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can delete workspace workspace_faq_items"
  on public.workspace_faq_items;
create policy "Users can delete workspace workspace_faq_items"
on public.workspace_faq_items for delete to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- agent_tool_events
drop policy if exists "Users can read workspace agent_tool_events"
  on public.agent_tool_events;
create policy "Users can read workspace agent_tool_events"
on public.agent_tool_events for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- chat
drop policy if exists "Users can read workspace chat_sessions" on public.chat_sessions;
create policy "Users can read workspace chat_sessions"
on public.chat_sessions for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can read workspace chat_messages" on public.chat_messages;
create policy "Users can read workspace chat_messages"
on public.chat_messages for select to authenticated
using (
  session_id in (
    select id from public.chat_sessions
    where workspace_id in (
      select workspace_id from public.profiles where id = (select auth.uid())
    )
  )
);

-- notifications
drop policy if exists "Users can read workspace notifications"
  on public.notifications;
create policy "Users can read workspace notifications"
on public.notifications for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

drop policy if exists "Users can update workspace notifications"
  on public.notifications;
create policy "Users can update workspace notifications"
on public.notifications for update to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
)
with check (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- booking_reminders
drop policy if exists "Users can read workspace booking_reminders"
  on public.booking_reminders;
create policy "Users can read workspace booking_reminders"
on public.booking_reminders for select to authenticated
using (
  workspace_id in (
    select workspace_id from public.profiles where id = (select auth.uid())
  )
);

-- workspace_invites — only this policy referenced auth.uid() directly; the
-- read/delete policies go through current_user_* helpers (rewritten above).
drop policy if exists "Owners can create workspace invites"
  on public.workspace_invites;
create policy "Owners can create workspace invites"
on public.workspace_invites for insert to authenticated
with check (
  public.current_user_is_workspace_owner()
  and workspace_id = public.current_user_workspace_id()
  and invited_by = (select auth.uid())
);
