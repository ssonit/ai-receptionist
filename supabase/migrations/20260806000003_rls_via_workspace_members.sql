-- Multi-workspace membership — phase 1 of 2, step 3 of 3.
--
-- Repoints every tenant policy at workspace_members. The predicate shape is
-- unchanged: these policies already used `in (...)`, which tolerates multiple
-- rows, so only the source of the id set moves.
--
-- Calls go through `in (select public.current_user_workspace_ids())` rather
-- than inlining the subquery: SECURITY DEFINER blocks function inlining, and
-- this form makes it an InitPlan evaluated once per statement instead of once
-- per row.
--
-- The two profiles self-policies ("Users can view own profile" / "Users can
-- update own profile") use `(select auth.uid()) = id` and are untouched.
--
-- After this migration current_user_is_workspace_owner() has no remaining
-- call sites. It is left defined (dropping it is Phase 2 cleanup) because a
-- drop would fail if any environment still had a policy referencing it.

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace workspaces" on public.workspaces;
create policy "Users can read workspace workspaces"
on public.workspaces for select to authenticated
using (id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace workspaces" on public.workspaces;
create policy "Users can update workspace workspaces"
on public.workspaces for update to authenticated
using (id in (select public.current_user_workspace_ids()))
with check (id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace leads" on public.leads;
create policy "Users can read workspace leads"
on public.leads for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace leads" on public.leads;
create policy "Users can insert workspace leads"
on public.leads for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace leads" on public.leads;
create policy "Users can update workspace leads"
on public.leads for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace bookings" on public.bookings;
create policy "Users can read workspace bookings"
on public.bookings for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace bookings" on public.bookings;
create policy "Users can insert workspace bookings"
on public.bookings for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace bookings" on public.bookings;
create policy "Users can update workspace bookings"
on public.bookings for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- conversation_logs
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace conversation_logs" on public.conversation_logs;
create policy "Users can read workspace conversation_logs"
on public.conversation_logs for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- workspace_event_types
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can read workspace workspace_event_types"
on public.workspace_event_types for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can insert workspace workspace_event_types"
on public.workspace_event_types for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can update workspace workspace_event_types"
on public.workspace_event_types for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can delete workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can delete workspace workspace_event_types"
on public.workspace_event_types for delete to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- workspace_faq_items
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can read workspace workspace_faq_items"
on public.workspace_faq_items for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can insert workspace workspace_faq_items"
on public.workspace_faq_items for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can update workspace workspace_faq_items"
on public.workspace_faq_items for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can delete workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can delete workspace workspace_faq_items"
on public.workspace_faq_items for delete to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- agent_tool_events
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace agent_tool_events" on public.agent_tool_events;
create policy "Users can read workspace agent_tool_events"
on public.agent_tool_events for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- chat
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace chat_sessions" on public.chat_sessions;
create policy "Users can read workspace chat_sessions"
on public.chat_sessions for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- chat_messages reaches workspace_id through chat_sessions; only the inner
-- membership lookup changes.
drop policy if exists "Users can read workspace chat_messages" on public.chat_messages;
create policy "Users can read workspace chat_messages"
on public.chat_messages for select to authenticated
using (
  session_id in (
    select id from public.chat_sessions
    where workspace_id in (select public.current_user_workspace_ids())
  )
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace notifications" on public.notifications;
create policy "Users can read workspace notifications"
on public.notifications for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace notifications" on public.notifications;
create policy "Users can update workspace notifications"
on public.notifications for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- booking_reminders
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace booking_reminders" on public.booking_reminders;
create policy "Users can read workspace booking_reminders"
on public.booking_reminders for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- billing_payments
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace billing_payments" on public.billing_payments;
create policy "Users can read workspace billing_payments"
on public.billing_payments for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- workspace_invites — owner-gated
-- -----------------------------------------------------------------------------
-- current_user_is_workspace_owner() answered "am I an owner anywhere", which
-- is meaningless once a user can be owner of one workspace and staff of
-- another. The owned-id set is both correct and strictly more precise.

drop policy if exists "Owners can read workspace invites" on public.workspace_invites;
create policy "Owners can read workspace invites"
on public.workspace_invites for select to authenticated
using (workspace_id in (select public.current_user_owned_workspace_ids()));

drop policy if exists "Owners can create workspace invites" on public.workspace_invites;
create policy "Owners can create workspace invites"
on public.workspace_invites for insert to authenticated
with check (
  workspace_id in (select public.current_user_owned_workspace_ids())
  and invited_by = (select auth.uid())
);

drop policy if exists "Owners can delete workspace invites" on public.workspace_invites;
create policy "Owners can delete workspace invites"
on public.workspace_invites for delete to authenticated
using (workspace_id in (select public.current_user_owned_workspace_ids()));

-- -----------------------------------------------------------------------------
-- profiles — teammate visibility
-- -----------------------------------------------------------------------------
-- Was `workspace_id = current_user_workspace_id()`, a single-value compare.
-- Becomes "shares any workspace with me", which is both wider in meaning and
-- more expensive. The Settings -> Team listing must narrow to the active
-- workspace in application code; this policy only grants permission.

drop policy if exists "Users can view workspace teammates" on public.profiles;
create policy "Users can view workspace teammates"
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.workspace_members m
    where m.user_id = profiles.id
      and m.workspace_id in (select public.current_user_workspace_ids())
  )
);
