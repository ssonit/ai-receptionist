# Manual booking cancellation — design

## Goal

Staff on `/dashboard/bookings` have no way to cancel a booking from the
dashboard. `agent/tools/cancel_appointment.ts` already lets a **guest**
cancel their own booking via chat, but that path requires the guest to prove
ownership (session / manage code / OTP / phone) and is gated by a
per-workspace cutoff and an enable/disable toggle — none of which apply to
staff acting with their own authority. Add a **Cancel booking** action to the
dashboard so staff don't have to go into Cal.com directly to cancel.

## Non-goals

- No reschedule. Only cancellation — matches the current scope of
  `2026-08-04-manual-booking-creation-design.md`, which only added create.
- No change to guest-initiated cancellation
  (`agent/tools/cancel_appointment.ts`'s auth, policy, or cutoff behavior).
- No bulk cancel. One booking at a time, from a row or its detail sheet.
- No un-cancel / restore. Cal.com's own cancel is the source of truth; if a
  cancellation was a mistake, staff re-create the booking (existing New
  booking flow) or fix it directly in Cal.com and Sync.

## Architecture

Same split as the create flow: shared Cal.com + Supabase logic in `lib/`,
called by both the guest-facing agent tool and a new staff-facing server
action.

```
components/bookings-table.tsx (client)
        │  opens
        ▼
components/ui/alert-dialog.tsx (new primitive, confirm step)
        │  calls
        ▼
app/dashboard/bookings/actions.ts → cancelManualBookingAction (new)
        │  calls
        ▼
lib/booking-cancel.ts (new) → lib/calcom.ts cancelCalBooking
```

### `lib/booking-cancel.ts` (new)

`agent/tools/cancel_appointment.ts` already contains the exact sequence a
staff cancel needs: call Cal.com, update the mirrored `bookings` row.
Extract it:

```ts
export type CancelWorkspaceBookingInput = {
  bookingId: string; // bookings.id
  calBookingUid: string;
  reason?: string;
  cancelledBy: "guest" | "owner";
};

export type CancelWorkspaceBookingResult =
  | { ok: true; status: "cancelled" }
  | { ok: false; error: string };

export async function cancelWorkspaceBooking(
  input: CancelWorkspaceBookingInput,
): Promise<CancelWorkspaceBookingResult>;
```

Behavior ported from `cancel_appointment.ts` lines ~82-108:
`withCalApiKey(cancelCalBooking)` → update `bookings` (`status: "cancelled",
list_status: "cancelled", cancelled_by: input.cancelledBy, raw:
cancelled.raw, synced_at: now`) scoped `.eq("id", input.bookingId)`. Same as
today: a mirror-update failure is logged server-side and does **not** fail
the result — Cal.com already cancelled, so the caller must not tell staff or
the guest that cancellation failed when it actually went through; the next
Sync click will reconcile.

`cancel_appointment.ts` is refactored to call this function instead of
inlining the Cal.com call + mirror update — same behavior, confirmed by its
existing test suite staying green unedited, same as the `createBooking`
refactor in the previous plan. `cancelled_by` for the guest path stays
`"guest"`; the new dashboard path passes `"owner"` — a value the
`bookings_cancelled_by_check` constraint already allows (`'guest' | 'owner' |
'cal'`) but that, until now, nothing ever wrote.

### `app/dashboard/bookings/actions.ts` (extend)

One new server action, following the same `requireStaff()` this file already
has (added by the manual-booking-creation plan):

```ts
export async function cancelManualBookingAction(input: {
  bookingId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }>;
```

Loads the booking scoped to the resolved workspace
(`.eq("id", input.bookingId).eq("workspace_id", workspaceId)`) — never a
bare-id read, same reasoning as `getWorkspaceEventTypeById` in the create
flow. Rejects with `APP_ERROR_CODE.NOT_FOUND` if it doesn't resolve, or is
already `status = "cancelled"`. Otherwise calls `getCalApiKeyForWorkspace` +
`withCalApiKey(apiKey, () => cancelWorkspaceBooking({ bookingId,
calBookingUid: booking.cal_booking_uid, reason: input.reason, cancelledBy:
"owner" }))`.

**Deliberately skips** `getWorkspaceGuestPolicy()` / `assertBookingChangeAllowed()`
— those gate a *guest* cancelling their own booking (cutoff minutes, an
owner-controlled enable/disable toggle). Staff are the owner side of that
toggle; applying it to themselves would let a workspace accidentally lock
its own staff out of cancelling a booking by mistake.

### No notification on staff-initiated cancel

`cancel_appointment.ts` creates a `booking_cancelled_by_guest` notification
so staff learn a guest cancelled behind their back.
`lib/sync-cal-bookings.ts` creates a `booking_cancelled` notification when a
Cal.com-side change is discovered on the next sync. Both exist because
*something happened staff didn't directly cause*. A staff member cancelling
from the dashboard is the opposite case — they are the one taking the
action, in the same request, and would just be notifying themselves.
`cancelManualBookingAction` does not call `createNotification`.

Cal.com's own cancel endpoint sends the attendee a cancellation email as
standard behavior — no new guest-facing notification channel is added here.

### UI: `components/ui/alert-dialog.tsx` (new)

No `AlertDialog` primitive exists in this repo yet — `dialog.tsx` is a plain
modal, not a confirm-before-destructive-action pattern. Add one following
`dialog.tsx`'s exact structure (pointer-events cleanup on close included),
built on `AlertDialog` from the `radix-ui` package (confirmed exported
alongside `Dialog`), matching this repo's shadcn convention.

### UI: `components/bookings-table.tsx` (extend)

**Cancel booking** (destructive-styled) is added to the `DropdownMenu` in
both places it currently appears — the row list and `BookingDetailSheet` —
right after the existing `DropdownMenuSeparator` / `Copy Cal UID` item.
Visible only when `rowView(row)` is `upcoming`, `unconfirmed`, or
`recurring` — hidden for `past` and `cancelled`, reusing the view
classification `bookings-table.tsx` already computes per row.

Clicking it opens the new `AlertDialog`: a confirm message naming the guest
and the appointment time, an optional reason `Textarea`, and a destructive
**Cancel booking** button that calls `cancelManualBookingAction`. On success:
close the dialog, toast, `router.refresh()` — same pattern as
`new-booking-dialog.tsx`. On failure: show the error inline, keep the dialog
open (so staff can retry without re-navigating).

`BookingDetailSheet` already renders a `cancelled_by`-driven badge —
`"Cancelled by guest"` for `"guest"`, `"Cancelled on Cal.com"` for `"cal"`,
nothing for any other value. A third branch is required, not optional:
`booking.cancelled_by === "owner" ? <Badge variant="secondary">Cancelled by
staff</Badge> : ...`. Without it, a staff-cancelled booking falls through the
existing `if/else if` chain silently — the cancellation itself would still
work, but the detail sheet would look identical to an ordinary upcoming
booking after `router.refresh()`, with nothing telling staff it was actually
cancelled short of checking the tab it landed in.

## Error handling

New code, not the generic `SAVE_FAILED` ("Could not save changes. Try
again.") that `cancel_appointment.ts` already falls back to for its own
catch-all — that message doesn't say what failed, and this is a
user-visible dashboard action, not an LLM-facing tool result:

```ts
BOOKING_CANCEL_FAILED: "booking_cancel_failed",
```
```ts
[APP_ERROR_CODE.BOOKING_CANCEL_FAILED]:
  "Could not cancel the booking. Try again.",
```

`cancelManualBookingAction` never returns a raw Cal.com/DB string to the
UI — same rule, same reasoning as `BOOKING_CREATE_FAILED` in the create
flow (`.claude/rules/errors.md` rule 1).

## Testing

- `lib/booking-cancel.test.ts` — unit test `cancelWorkspaceBooking` with
  Cal.com and Supabase mocked (same shape as `lib/booking-create.test.ts`):
  success sets `status`/`list_status`/`cancelled_by`; a Supabase update
  failure still returns `ok: true` (Cal.com already cancelled) and logs
  server-side.
- `app/dashboard/bookings/actions.test.ts` (extend) — `cancelManualBookingAction`
  rejects a `bookingId` outside the resolved workspace; rejects an
  already-cancelled booking without calling Cal.com; passes `cancelledBy:
  "owner"` through; wraps a Cal.com failure in `BOOKING_CANCEL_FAILED`
  rather than the raw message.
- Regenerate `tests/agent-tools/cancel_appointment.test.ts` (if one exists —
  confirm at implementation time the way `tests/agent-tools/book_appointment.test.ts`
  was confirmed for the create refactor) runs unchanged after the extraction,
  as the behavior-parity check.
- Manual: `npx supabase db reset`, cancel a booking from the dashboard,
  confirm it moves to the Cancelled tab, `cancelled_by = 'owner'` in
  Supabase, and the booking shows cancelled in Cal.com's calendar.

## Risks

- **Mirror-update race with a concurrent guest cancel.** If a guest cancels
  the same booking via chat in the same window, Cal.com's own cancel
  endpoint is idempotent-ish (cancelling an already-cancelled booking
  typically errors rather than double-cancelling) — `cancelWorkspaceBooking`
  surfaces that as a normal `ok: false`, which `cancelManualBookingAction`
  wraps in `BOOKING_CANCEL_FAILED`. No special handling beyond that; the
  error message doesn't distinguish "already cancelled" from "Cal.com
  rejected it," which is an acceptable gap for a low-frequency race.
- **`cancelled_by: "owner"` is a new value in practice, not just in schema.**
  It is the first thing to ever write it, so every existing place that
  branches on `cancelled_by` needs auditing for a missing case, not just the
  one badge already called out above in the UI section — a grep for
  `cancelled_by` at implementation time is cheaper than trusting this list is
  complete.
