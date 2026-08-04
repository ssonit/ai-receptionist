# Manual booking creation — design

## Goal

Staff on `/dashboard/bookings` currently have no way to create a booking
themselves — the page only mirrors Cal.com and offers a Sync button. A guest
who calls in or walks up has to be booked directly in Cal.com and then pulled
back in with Sync. Add a **New booking** flow on that page so staff can create
a real Cal.com booking without leaving the dashboard.

## Non-goals

- No new role gate. `/dashboard/bookings` is already open to owner and staff;
  this feature does not restrict who can use it.
- No manual time entry. Staff pick from real availability, the same guarantee
  `check_availability` / `book_appointment` give the agent — never invent a
  slot.
- No behavior change to the AI booking path. `book_appointment.ts` keeps
  calling `getAiBookingEventType()` and this feature does not touch which
  meeting type the agent uses or how it picks one. The file itself does get a
  behavior-preserving refactor (see Architecture) so it shares the new
  `createWorkspaceBooking()` helper instead of duplicating it — that is scope,
  not a non-goal.
- No editing or cancelling existing bookings — this is create-only, matching
  the current page's scope.

## Architecture

Three layers, following the existing split:

```
components/new-booking-dialog.tsx (client, "use client")
        │  calls
        ▼
app/dashboard/bookings/actions.ts (server actions)
        │  calls
        ▼
lib/booking-create.ts (new)  +  lib/calcom.ts, lib/workspace-cal.ts (existing)
```

### `lib/booking-create.ts` (new)

`book_appointment.ts` already contains the exact sequence a manual booking
needs: call Cal.com, mirror to `bookings`, upsert the lead, notify, track
analytics. Duplicating that ~80-line sequence in a server action would
violate the "reuse before inventing" rule in `code-structure.md`. Extract it
instead:

```ts
export type CreateWorkspaceBookingInput = {
  workspaceId: string;
  eventRef: { eventTypeId?: number; eventTypeSlug: string; username: string };
  eventTitle: string;
  start: string; // ISO, must still be open — caller re-checks via getAvailableSlots
  guestName: string;
  phone: string;
  email: string;
  timeZone: string;
  locale?: string;
  notes?: string;
  service?: string;
  sessionId?: string | null;
  visitorId?: string | null;
  chatSessionId?: string | null;
  guestTimeZone?: string | null;
  source: "chat" | "staff";
  staffUserId?: string | null; // required when source === "staff"
};

export type CreateWorkspaceBookingResult =
  | { ok: true; booking: { uid: string; start: string; status: string; meetingUrl: string | null; display: string }; manageCode: string; warning?: string }
  | { ok: false; error: string };

export async function createWorkspaceBooking(
  input: CreateWorkspaceBookingInput,
): Promise<CreateWorkspaceBookingResult>;
```

Behavior ported as-is from `book_appointment.ts`'s tail (lines ~128-304):
`withCalApiKey(createBooking)` → upsert `bookings` (`onConflict:
"workspace_id,cal_booking_uid"`) with the new `created_by_staff_id` column set
from `input.staffUserId` → `upsertLeadAsBooked` → `createNotification({type:
"booking_created", ...})` → `trackServer(ANALYTICS_EVENT.BOOKING_CREATED,
workspaceId, { source: input.source, ... })` → same Supabase-mirror-failed
fallback path (still returns `ok: true` with a `warning`, since the Cal.com
booking is real either way).

`book_appointment.ts` is refactored to call this function instead of
inlining the sequence — same behavior, no test-visible change, confirmed by
`npm test` staying green. This is the only existing file this feature
modifies outside additive new files, plus `sync-cal-bookings.ts` (see below).

### `app/dashboard/bookings/actions.ts` (new)

Two server actions, following the `requireStaff()` pattern from
`app/dashboard/conversations/actions.ts` — workspace and identity come from
`getDashboardUser()`, never from the client:

```ts
async function requireStaff(): Promise<
  | { error: string }
  | { workspaceId: string; staffUserId: string; timeZone: string }
>;

export async function getAvailableSlotsAction(input: {
  meetingTypeId: string; // workspace_event_types.id
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<{ ok: true; slots: { start: string; display: string }[] } | { ok: false; error: string }>;

export async function createManualBookingAction(input: {
  meetingTypeId: string;
  start: string; // ISO, from a slot getAvailableSlotsAction just returned
  guestName: string;
  phone: string;
  email: string;
  notes?: string;
}): Promise<{ ok: true; bookingUid: string } | { ok: false; error: string }>;
```

`getAvailableSlotsAction` loads the `workspace_event_types` row by
`meetingTypeId`, scoped to the resolved `workspaceId` (never trust a bare id
from the client — same reasoning as `getWorkspaceChatSession` in the handoff
feature), builds the Cal.com `eventRef` from it, and calls
`getAvailableSlots` through `withCalApiKey(getCalApiKeyForWorkspace(...))`.
Business timezone comes from `workspaces.timezone` (fallback
`bookingConfig.timezone`), matching `check_availability.ts`. Slots display
using the business timezone only — no guest timezone to reconcile here,
staff are picking a real calendar time.

`createManualBookingAction` re-resolves the same `eventRef` from
`meetingTypeId`, then calls `createWorkspaceBooking({ ..., source: "staff",
staffUserId })`. It does **not** re-verify the slot is still open before
calling Cal.com — `lib/calcom.ts` `createBooking` already fails with a real
Cal.com error if the slot was taken between the staff member loading slots
and clicking submit, and that error surfaces through the existing `ok: false`
path. Re-checking here would just be an extra round trip for a race window
staff, unlike guests, are actively working through in real time.

### `components/new-booking-dialog.tsx` (new)

Client component, opened from a **New booking** button next to **Sync
Cal.com** on `/dashboard/bookings`. Uses `Dialog` (`components/ui/dialog.tsx`)
— a single-submit form, not the polling/refresh shape that justified `Sheet`
for the conversation detail view.

Steps inside one dialog (not a multi-page wizard — everything fits on one
scroll):

1. **Meeting type** — `Select` populated from `listWorkspaceMeetingTypes()`
   (passed in as a server-loaded prop from `bookings/page.tsx`, not fetched
   client-side — same pattern as `hostName`/`timeZone` already being props).
2. **Date** — a date input (today or later). On change (and on meeting-type
   change), call `getAvailableSlotsAction` for a 1-day window and render the
   returned slots as buttons. Loading and empty ("No open slots this day")
   states shown inline.
3. **Slot** — clicking a slot selects it (radio-button styled), enabling the
   rest of the form.
4. **Guest info** — name, phone, email (all required, matching
   `book_appointment.ts`'s `inputSchema`), notes (optional).
5. **Submit** — calls `createManualBookingAction`. On success, close the
   dialog, show a toast ("Booking created"), and refresh the bookings list
   (`router.refresh()` — the page is a Server Component reading straight from
   Supabase, no client cache to invalidate). On failure, show the error
   inline in the dialog without closing it, so staff don't lose what they
   typed.

No i18n catalog wiring — this dialog's copy stays English literals, matching
the deliberate precedent set by `conversations-table.tsx` /
`conversation-detail-sheet.tsx`, which are dashboard-operator chrome outside
the guest-facing `messages/*.json` split.

## Data

One migration, adding a single nullable column:

```sql
alter table public.bookings
  add column created_by_staff_id uuid references public.profiles(id) on delete set null;

comment on column public.bookings.created_by_staff_id is
  'Set when a staff member created this booking from the dashboard. Null means it came from the chat agent or was created directly in Cal.com.';
```

No new `source` enum — `created_by_staff_id IS NOT NULL` is the "created by
staff" signal, one column instead of two that would need to agree with each
other. `ON DELETE SET NULL` matches the existing `chat_sessions.claimed_by`
pattern from the staff-reply-handoff migration: if the staff account is later
removed, the booking survives, just anonymized.

### Sync must preserve it

`sync-cal-bookings.ts` `upsertCalBookings()` does a full-row upsert on
`cal_booking_uid`, explicitly carrying forward fields the sync itself doesn't
know about (`visitor_id`, `chat_session_id`, `manage_code_hash`,
`guest_timezone`, `session_id`) by reading them off the `existingByUid` map
before overwriting. `created_by_staff_id` must join that list — add it to the
existing-row `select(...)` at line 84 and to the upserted row at line ~119
(`created_by_staff_id: prev?.created_by_staff_id ?? null`). Skipping this
would silently wipe the attribution on the very next Sync click after a
manual booking is created.

## UI: showing who created it

`bookings-table.tsx` already renders a `service` / `status` badge per row.
`app/dashboard/bookings/page.tsx` adds a staff-name join for rows where
`created_by_staff_id` is set — same `profiles` lookup `loadConversationDetail`
already does for `claimedByName` — and passes it through so the table can
show a small badge ("Booked by {name}") next to those rows. Bookings with a
null `created_by_staff_id` show no badge (came from the chat agent or
directly from Cal.com), matching the existing row style for those.

## Error handling

Both server actions return `{ ok: true, ... } | { ok: false, error }`, never
throw past the boundary — same contract as `conversation-handoff.ts` and the
agent tools. Errors surfaced:

- No Cal.com key configured → reuse `APP_ERROR_CODE.CAL_NOT_CONFIGURED_GUEST`
  / `appErrorMessage()`.
- Meeting type not found / not in this workspace → generic "not found",
  same shape as `sendStaffMessage`'s session lookup failure.
- Cal.com booking creation itself fails (slot taken, validation error) →
  the raw Cal.com error message, same as `book_appointment.ts` already
  surfaces to the agent today.

## Testing

- `lib/booking-create.test.ts` — unit test `createWorkspaceBooking` with
  Cal.com and Supabase mocked (same mocking shape as
  `lib/conversation-handoff.test.ts`): success path, Supabase-mirror-failure
  path (still `ok: true` with `warning`), `source: "staff"` sets
  `created_by_staff_id`, `source: "chat"` leaves it null.
- `app/dashboard/bookings/actions.test.ts` — `getAvailableSlotsAction`
  rejects a `meetingTypeId` outside the resolved workspace;
  `createManualBookingAction` requires all guest fields and surfaces a
  Cal.com failure as `ok: false` without throwing.
- Regenerate `agent/tools/book_appointment.test.ts` runs unchanged (behavior
  parity check for the refactor) — if any assertion needs updating because of
  the extraction, that is a signal the refactor changed behavior and needs a
  second look before merging.
- Manual: `npx supabase db reset`, open `/dashboard/bookings` as staff,
  create a booking through the dialog, confirm it appears in Cal.com's
  calendar and in the table with the "Manual" marker, then click Sync and
  confirm `created_by_staff_id` survives.

## Risks

- **Race between loading slots and submitting.** Deliberately not re-checked
  server-side (see `createManualBookingAction` above) — Cal.com's own
  rejection is the guard, surfaced as a normal `ok: false` error the staff
  member can act on immediately (pick another slot).
- **`sync-cal-bookings.ts` regression risk.** The preserve-on-sync list is
  easy to extend incorrectly (miss the column in one of the two places it's
  read/written). Covered by a dedicated assertion in the sync test file, not
  just relying on the manual verification step above.
