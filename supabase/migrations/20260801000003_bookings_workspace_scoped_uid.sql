-- =============================================================================
-- Scope the bookings uniqueness to the tenant.
--
-- `cal_booking_uid` was globally UNIQUE, so two workspaces connected to the
-- same Cal.com account could not both hold the same booking: whichever synced
-- last took the row over via `on conflict (cal_booking_uid)`, overwriting
-- `workspace_id` and carrying `manage_code_hash` / `visitor_id` /
-- `chat_session_id` across tenants.
--
-- Safe to apply: the composite key is strictly weaker than the global one, so
-- existing rows cannot conflict. Foreign keys (booking_verifications,
-- booking_reminders) reference bookings(id), not this constraint.
--
-- DEPLOY ORDER: this migration must land before the app code that upserts with
-- `on_conflict=workspace_id,cal_booking_uid`, otherwise PostgREST rejects the
-- upsert with "no unique or exclusion constraint matching the ON CONFLICT
-- specification".
-- =============================================================================

alter table public.bookings
  drop constraint if exists bookings_cal_booking_uid_key;

alter table public.bookings
  add constraint bookings_workspace_cal_uid_key
  unique (workspace_id, cal_booking_uid);

comment on constraint bookings_workspace_cal_uid_key on public.bookings is
  'Tenant-scoped booking identity. Never widen back to a global unique on cal_booking_uid — see 20260801000003.';
