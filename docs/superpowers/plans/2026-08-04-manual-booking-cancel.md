# Manual Booking Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff on `/dashboard/bookings` cancel a booking — Cal.com and the mirrored Supabase row — without leaving the dashboard.

**Architecture:** A shared `lib/booking-cancel.ts` helper does the Cal.com-cancel + Supabase-mirror-update sequence that `agent/tools/cancel_appointment.ts` (guest self-service via chat) already does; both that tool and a new `cancelManualBookingAction` server action call it instead of duplicating it. Staff skip the guest-only ownership/cutoff/toggle gates entirely. A new `components/ui/alert-dialog.tsx` primitive (none exists yet) backs a confirm-before-cancel step wired into both places `bookings-table.tsx` already has a "..." menu.

**Tech Stack:** Next.js App Router server actions, Supabase (Postgres + admin client), Cal.com API v2 (`lib/calcom.ts`), Radix `AlertDialog` (via the `radix-ui` package, already a dependency), Vitest, `tests/helpers/supabase-mock.ts`.

## Global Constraints

- This plan depends on `docs/superpowers/plans/2026-08-04-manual-booking-creation.md` already being implemented — it extends `app/dashboard/bookings/actions.ts`'s `requireStaff()` and imports, and follows `components/new-booking-dialog.tsx`'s exact `useActionState` + `router.refresh()` pattern. Confirmed present on disk as of this plan (`git log --oneline -- app/dashboard/bookings/actions.ts` shows it was implemented).
- Staff cancel is **not** gated by `getWorkspaceGuestPolicy()` / `assertBookingChangeAllowed()` — those exist only to constrain a *guest* cancelling their own booking (per-workspace cutoff minutes, an owner-controlled enable/disable toggle). Staff are the owner side of that toggle.
- Server actions return `{ ok: true, ... } | { ok: false, error }`, never throw past the boundary.
- Workspace and staff identity come from `getDashboardUser()` on the server, never from the client.
- Errors shown in the dashboard UI go through `APP_ERROR_CODE` / `appErrorMessage()` — never a raw Cal.com/DB string (`.claude/rules/errors.md` rule 1).
- No i18n catalog wiring — plain English literals, matching `bookings-table.tsx` and `new-booking-dialog.tsx`.
- `lib/booking-cancel.ts`'s `cancelWorkspaceBooking()` **throws** on a Cal.com failure and does **not** return `{ ok: false }` for that case — this matches `agent/tools/cancel_appointment.ts`'s actual current behavior exactly (a `cancelCalBooking` failure today propagates to the tool's own outer `catch` block), so the refactor in Task 2 is a true no-op for that path. It always swallows a Supabase mirror-update failure (logs, never throws or returns an error for it) — Cal.com already cancelled by that point, so a mirror hiccup must not be reported as a cancel failure. This is one deliberate improvement over `cancel_appointment.ts`'s original code: the original only handled a *returned* `{ error }`, not a *thrown* client/network error, during the mirror update — an untested gap (none of its 4 existing tests exercise that path). The shared helper wraps the update in `try`/`catch` so both failure shapes are handled the same way; this does not change any of `cancel_appointment.ts`'s currently-tested behavior.
- After every task: `npm run typecheck` must pass. After UI tasks: `npm run doctor`. Commit after each task.

---

### Task 1: `lib/booking-cancel.ts` — shared Cal.com + Supabase cancel helper

**Files:**
- Create: `lib/booking-cancel.ts`
- Test: `lib/booking-cancel.test.ts`

**Interfaces:**
- Consumes: `cancelCalBooking` from `@/lib/calcom`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `cancelWorkspaceBooking(input: CancelWorkspaceBookingInput): Promise<{ status: "cancelled" }>`, `type CancelWorkspaceBookingInput` — used by Task 2 (agent tool) and Task 4 (dashboard action). **Precondition the caller must satisfy:** the call must happen inside `withCalApiKey(apiKey, () => cancelWorkspaceBooking(input))`, same as `createWorkspaceBooking` in `lib/booking-create.ts`.

- [ ] **Step 1: Write the failing test file**

Create `lib/booking-cancel.test.ts`:

```ts
/**
 * cancelWorkspaceBooking unit tests. Supabase is mocked globally via
 * tests/setup.ts. Cal.com's cancelCalBooking is mocked here — this is the
 * layer below withCalApiKey, so no API key handling to fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryBuilder, supabaseMock } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    cancelCalBooking: vi.fn(),
  };
});

const BOOKING_ID = "booking-1";
const CAL_UID = "cal_uid_1";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  supabaseMock.seed("bookings", [
    {
      id: BOOKING_ID,
      workspace_id: "ws-1",
      cal_booking_uid: CAL_UID,
      status: "accepted",
      list_status: "upcoming",
    },
  ]);
});

describe("cancelWorkspaceBooking", () => {
  it("cancels on Cal.com and mirrors the status with the given cancelledBy", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockResolvedValue({
      uid: CAL_UID,
      start: "2026-08-05T09:00:00.000Z",
      status: "cancelled",
      raw: { id: 1 },
    });

    const { cancelWorkspaceBooking } = await import("./booking-cancel");
    const result = await cancelWorkspaceBooking({
      bookingId: BOOKING_ID,
      calBookingUid: CAL_UID,
      reason: "Guest asked to reschedule",
      cancelledBy: "owner",
    });

    expect(result).toEqual({ status: "cancelled" });
    expect(calcom.cancelCalBooking).toHaveBeenCalledWith({
      bookingUid: CAL_UID,
      cancellationReason: "Guest asked to reschedule",
    });

    const row = supabaseMock.getRows("bookings").find((r) => r.id === BOOKING_ID);
    expect(row?.status).toBe("cancelled");
    expect(row?.list_status).toBe("cancelled");
    expect(row?.cancelled_by).toBe("owner");
  });

  it("propagates a Cal.com failure instead of swallowing it", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockRejectedValue(
      new Error("Cal.com: booking already cancelled"),
    );

    const { cancelWorkspaceBooking } = await import("./booking-cancel");
    await expect(
      cancelWorkspaceBooking({
        bookingId: BOOKING_ID,
        calBookingUid: CAL_UID,
        cancelledBy: "owner",
      }),
    ).rejects.toThrow("already cancelled");

    // Cal.com never confirmed the cancel, so the mirror must not change.
    const row = supabaseMock.getRows("bookings").find((r) => r.id === BOOKING_ID);
    expect(row?.status).toBe("accepted");
  });

  it("still resolves when the Supabase mirror update fails", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockResolvedValue({
      uid: CAL_UID,
      start: "2026-08-05T09:00:00.000Z",
      status: "cancelled",
      raw: {},
    });

    vi.spyOn(QueryBuilder.prototype, "update").mockImplementationOnce(() => {
      throw new Error("DB connection lost");
    });

    const { cancelWorkspaceBooking } = await import("./booking-cancel");
    const result = await cancelWorkspaceBooking({
      bookingId: BOOKING_ID,
      calBookingUid: CAL_UID,
      cancelledBy: "guest",
    });

    // Cal.com already cancelled — a mirror hiccup is not this caller's failure.
    expect(result).toEqual({ status: "cancelled" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/booking-cancel.test.ts`
Expected: FAIL — `Cannot find module './booking-cancel'`.

- [ ] **Step 3: Write `lib/booking-cancel.ts`**

Ported from `agent/tools/cancel_appointment.ts` lines 82-108 (the Cal.com cancel + Supabase mirror-update sequence), generalized with `cancelledBy`:

```ts
/**
 * The single place that cancels a real Cal.com booking and mirrors the
 * change into Supabase. `agent/tools/cancel_appointment.ts` (guest
 * self-service via chat) and the dashboard's cancel action both call this
 * instead of duplicating the sequence.
 *
 * Caller must already be inside `withCalApiKey(apiKey, () => ...)` — this
 * function does not touch the API key itself.
 */
import { cancelCalBooking } from "@/lib/calcom";
import { createAdminClient } from "@/lib/supabase/admin";

export type CancelWorkspaceBookingInput = {
  bookingId: string;
  calBookingUid: string;
  reason?: string;
  cancelledBy: "guest" | "owner";
};

export async function cancelWorkspaceBooking(
  input: CancelWorkspaceBookingInput,
): Promise<{ status: "cancelled" }> {
  const cancelled = await cancelCalBooking({
    bookingUid: input.calBookingUid,
    cancellationReason: input.reason,
  });

  // Cal.com already cancelled by the time we get here — nothing below this
  // point may throw out of the function. A mirror failure (returned error or
  // a thrown client/network error) must not be reported as a cancel failure;
  // it would leave the dashboard showing the slot as still booked until the
  // next cron sync, but the booking really is cancelled on Cal.com.
  try {
    const supabase = createAdminClient();
    const { error: mirrorError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        list_status: "cancelled",
        cancelled_by: input.cancelledBy,
        raw: cancelled.raw,
        synced_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId);
    if (mirrorError) throw new Error(mirrorError.message);
  } catch (mirrorError) {
    console.error(
      `[booking-cancel] mirror failed for ${input.calBookingUid}`,
      mirrorError,
    );
  }

  return { status: "cancelled" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/booking-cancel.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/booking-cancel.ts lib/booking-cancel.test.ts
git commit -m "feat(bookings): extract cancelWorkspaceBooking shared helper"
```

---

### Task 2: Refactor `cancel_appointment.ts` to use the shared helper

**Files:**
- Modify: `agent/tools/cancel_appointment.ts`
- Test: `tests/agent-tools/cancel_appointment.test.ts` (must pass unchanged — behavior-preservation check, no edits to this file)

**Interfaces:**
- Consumes: `cancelWorkspaceBooking` from `@/lib/booking-cancel` (Task 1).

This is a **behavior-preserving refactor**. `tests/agent-tools/cancel_appointment.test.ts` already covers the branches this touches (happy path, actor-resolution failure, cutoff-policy failure, missing Cal key). If any assertion needs to change to pass, stop — the refactor changed behavior, out of scope here.

- [ ] **Step 1: Run the existing test to confirm the starting baseline is green**

Run: `npx vitest run tests/agent-tools/cancel_appointment.test.ts`
Expected: PASS, all 4 tests green (pre-refactor baseline).

- [ ] **Step 2: Replace the cancel + mirror-update block with a call to `cancelWorkspaceBooking`**

In `agent/tools/cancel_appointment.ts`, replace this block (current lines 82-108):

```ts
      const cancelled = await withCalApiKey(apiKey, () =>
        cancelCalBooking({
          bookingUid: booking.cal_booking_uid,
          cancellationReason: reason,
        }),
      );

      const supabase = createAdminClient();
      const { error: mirrorError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          list_status: "cancelled",
          cancelled_by: "guest",
          raw: cancelled.raw,
          synced_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      // Cal.com already cancelled — a silent mirror failure would leave the
      // dashboard showing the slot as still booked until the next cron sync.
      if (mirrorError) {
        console.error(
          `[cancel_appointment] mirror failed for ${booking.cal_booking_uid}`,
          mirrorError,
        );
      }
```

with:

```ts
      await withCalApiKey(apiKey, () =>
        cancelWorkspaceBooking({
          bookingId: booking.id,
          calBookingUid: booking.cal_booking_uid,
          reason,
          cancelledBy: "guest",
        }),
      );
```

A `cancelWorkspaceBooking` throw (Cal.com failure) still propagates to this file's existing outer `catch (error)` block (current lines 139-152), which already returns `toolError(APP_ERROR_CODE.SAVE_FAILED)` — identical to today's behavior when `cancelCalBooking` itself throws.

Update the import block at the top of the file:

```ts
import { cancelWorkspaceBooking } from "@/lib/booking-cancel";
```

Remove now-unused imports: `cancelCalBooking` (from `@/lib/calcom` — `withCalApiKey` from the same import stays, still used), `createAdminClient` (from `@/lib/supabase/admin`).

- [ ] **Step 3: Run the existing test again to verify no regression**

Run: `npx vitest run tests/agent-tools/cancel_appointment.test.ts`
Expected: PASS, same 4 tests green, no assertion changed. If any assertion now fails, revert Step 2 and re-check the ported logic in Task 1 against the original lines 82-108 line by line — do not edit the test file to make it pass.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (also catches any leftover unused import from Step 2).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass, same total count as before this task.

- [ ] **Step 6: Commit**

```bash
git add agent/tools/cancel_appointment.ts
git commit -m "refactor(agent): use the shared cancelWorkspaceBooking helper"
```

---

### Task 3: `components/ui/alert-dialog.tsx` primitive

**Files:**
- Create: `components/ui/alert-dialog.tsx`

**Interfaces:**
- Consumes: `AlertDialog` from the `radix-ui` package (`import { AlertDialog as AlertDialogPrimitive } from "radix-ui"` — confirmed exported alongside `Dialog`, same package `components/ui/dialog.tsx` already uses); `buttonVariants` from `@/components/ui/button`; `cn` from `@/lib/utils`.
- Produces: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` — used by Task 5.

No test file — this is a UI primitive with no logic of its own, matching `components/ui/dialog.tsx` and `components/ui/sheet.tsx`, neither of which has one.

- [ ] **Step 1: Write the primitive, matching `dialog.tsx`'s exact structure**

Create `components/ui/alert-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function AlertDialog({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return (
    <AlertDialogPrimitive.Root
      data-slot="alert-dialog"
      onOpenChange={(open) => {
        if (!open) {
          // Same DropdownMenu + Dialog pointer-events race as Sheet/Dialog.
          const clear = () => {
            if (document.body.style.pointerEvents === "none") {
              document.body.style.pointerEvents = "";
            }
          };
          requestAnimationFrame(clear);
          window.setTimeout(clear, 0);
          window.setTimeout(clear, 150);
        }
        onOpenChange?.(open);
      }}
      {...props}
    />
  );
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/alert-dialog.tsx
git commit -m "feat(ui): add the AlertDialog primitive"
```

---

### Task 4: `cancelManualBookingAction` server action

**Files:**
- Modify: `app/dashboard/bookings/actions.ts`
- Modify: `lib/errors/app-codes.ts`, `lib/errors/app-messages.ts` (add `BOOKING_CANCEL_FAILED`)
- Test: `app/dashboard/bookings/actions.test.ts` (extend — file exists from the create-booking plan)

**Interfaces:**
- Consumes: `cancelWorkspaceBooking` (Task 1); existing `requireStaff()` (already in this file); `createAdminClient` from `@/lib/supabase/admin` (newly imported into this file); `getCalApiKeyForWorkspace`, `withCalApiKey` (already imported); `APP_ERROR_CODE.BOOKING_ALREADY_CANCELLED` (already exists — reused, not new); `APP_ERROR_CODE.NOT_FOUND` (already exists — reused).
- Produces: `cancelManualBookingAction(input: { bookingId: string; reason?: string }): Promise<{ ok: true } | { ok: false; error: string }>` — used by Task 5's dialog.

- [ ] **Step 1: Add the `BOOKING_CANCEL_FAILED` error code**

In `lib/errors/app-codes.ts`, add one line at the end of the `APP_ERROR_CODE` object (after `BOOKING_CREATE_FAILED`, currently the last entry):

```ts
  BOOKING_CANCEL_FAILED: "booking_cancel_failed",
```

In `lib/errors/app-messages.ts`, add the matching entry at the end of `APP_ERROR_MESSAGE` (after `BOOKING_CREATE_FAILED`, currently the last entry before the closing `} as const satisfies ...`):

```ts
  [APP_ERROR_CODE.BOOKING_CANCEL_FAILED]:
    "Could not cancel the booking. Try again.",
```

- [ ] **Step 2: Write the failing test additions**

Append to `app/dashboard/bookings/actions.test.ts`. First add `cancelWorkspaceBooking` to the hoisted mocks and its `vi.mock`:

```ts
// Add to the existing `mocks = vi.hoisted(() => ({ ... }))` object:
  cancelWorkspaceBooking: vi.fn(),

// Add alongside the existing vi.mock("@/lib/booking-create", ...) call:
vi.mock("@/lib/booking-cancel", () => ({
  cancelWorkspaceBooking: mocks.cancelWorkspaceBooking,
}));
```

Then add a `describe` block, using the same `seedMeetingType()`-style seeding already in this file (seed `workspaces` for the Cal key check) plus a `bookings` row:

```ts
function seedBooking(overrides?: Record<string, unknown>) {
  supabaseMock.seed("bookings", [
    {
      id: "booking-1",
      workspace_id: WS,
      cal_booking_uid: "cal_uid_1",
      status: "accepted",
      ...overrides,
    },
  ]);
  supabaseMock.seed("workspaces", [
    {
      id: WS,
      name: "Acme",
      slug: "acme",
      timezone: "Asia/Ho_Chi_Minh",
      cal_username: "acme-biz",
      cal_api_key_encrypted: "encrypted-key",
      service_mode: "onsite",
    },
  ]);
}

describe("cancelManualBookingAction", () => {
  it("cancels with cancelledBy: owner", async () => {
    seedBooking();
    mocks.cancelWorkspaceBooking.mockResolvedValue({ status: "cancelled" });

    const { cancelManualBookingAction } = await import("./actions");
    const result = await cancelManualBookingAction({
      bookingId: "booking-1",
      reason: "Guest asked to reschedule",
    });

    expect(result.ok).toBe(true);
    expect(mocks.cancelWorkspaceBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking-1",
        calBookingUid: "cal_uid_1",
        reason: "Guest asked to reschedule",
        cancelledBy: "owner",
      }),
    );
  });

  it("rejects a booking id from another workspace without calling Cal.com", async () => {
    seedBooking({ workspace_id: OTHER_WS });

    const { cancelManualBookingAction } = await import("./actions");
    const result = await cancelManualBookingAction({ bookingId: "booking-1" });

    expect(result.ok).toBe(false);
    expect(mocks.cancelWorkspaceBooking).not.toHaveBeenCalled();
  });

  it("rejects an already-cancelled booking without calling Cal.com", async () => {
    seedBooking({ status: "cancelled" });

    const { cancelManualBookingAction } = await import("./actions");
    const result = await cancelManualBookingAction({ bookingId: "booking-1" });

    expect(result.ok).toBe(false);
    expect(mocks.cancelWorkspaceBooking).not.toHaveBeenCalled();
  });

  it("wraps a Cal.com failure in the generic error code, not the raw message", async () => {
    seedBooking();
    mocks.cancelWorkspaceBooking.mockRejectedValue(
      new Error("Cal.com says: booking_not_found"),
    );

    const { cancelManualBookingAction } = await import("./actions");
    const result = await cancelManualBookingAction({ bookingId: "booking-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("booking_not_found");
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run app/dashboard/bookings/actions.test.ts`
Expected: FAIL — `cancelManualBookingAction` is not exported from `./actions`.

- [ ] **Step 4: Add `cancelManualBookingAction` to `app/dashboard/bookings/actions.ts`**

Add the import for `createAdminClient` at the top (new import, not currently in this file):

```ts
import { createAdminClient } from "@/lib/supabase/admin";
```

Add the import for the new helper:

```ts
import { cancelWorkspaceBooking } from "@/lib/booking-cancel";
```

Append a private lookup helper (after `resolveEventRef`, before `getAvailableSlotsAction`):

```ts
async function getWorkspaceBookingById(workspaceId: string, bookingId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, workspace_id, cal_booking_uid, status")
    .eq("workspace_id", workspaceId)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
```

Append the action at the end of the file:

```ts
export async function cancelManualBookingAction(input: {
  bookingId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireStaff();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const booking = await getWorkspaceBookingById(ctx.workspaceId, input.bookingId);
  if (!booking || !booking.cal_booking_uid) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.NOT_FOUND) };
  }
  if (booking.status === "cancelled") {
    return {
      ok: false,
      error: appErrorMessage(APP_ERROR_CODE.BOOKING_ALREADY_CANCELLED),
    };
  }

  let apiKey: string;
  try {
    apiKey = await getCalApiKeyForWorkspace(ctx.workspaceId);
  } catch {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
  }

  try {
    await withCalApiKey(apiKey, () =>
      cancelWorkspaceBooking({
        bookingId: booking.id,
        calBookingUid: booking.cal_booking_uid!,
        reason: input.reason,
        cancelledBy: "owner",
      }),
    );
    return { ok: true };
  } catch (error) {
    console.error("[bookings] cancelManualBookingAction failed", error);
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CANCEL_FAILED) };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/bookings/actions.test.ts`
Expected: PASS, all tests green (the 4 new ones plus every existing test in this file, unaffected).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors — this is what catches a missing `APP_ERROR_MESSAGE` entry from Step 1.

- [ ] **Step 7: Commit**

```bash
git add lib/errors/app-codes.ts lib/errors/app-messages.ts app/dashboard/bookings/actions.ts app/dashboard/bookings/actions.test.ts
git commit -m "feat(bookings): add cancelManualBookingAction"
```

---

### Task 5: `components/cancel-booking-alert-dialog.tsx`

**Files:**
- Create: `components/cancel-booking-alert-dialog.tsx`

**Interfaces:**
- Consumes: `cancelManualBookingAction` (Task 4); `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from `@/components/ui/alert-dialog` (Task 3); `Label` from `@/components/ui/label`; `Textarea` from `@/components/ui/textarea`.
- Produces: `CancelBookingAlertDialog({ booking, timeZone, open, onOpenChange }: { booking: CancelBookingTarget | null; timeZone: string; open: boolean; onOpenChange: (open: boolean) => void })`, `type CancelBookingTarget = { id: string; guest_name: string; start_time: string }` — used by Task 6.

No dedicated test file — a client component driving one already-unit-tested server action, matching `components/new-booking-dialog.tsx`, which has none either.

- [ ] **Step 1: Write the component**

Create `components/cancel-booking-alert-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelManualBookingAction } from "@/app/dashboard/bookings/actions";

export type CancelBookingTarget = {
  id: string;
  guest_name: string;
  start_time: string;
};

export function CancelBookingAlertDialog({
  booking,
  timeZone,
  open,
  onOpenChange,
}: {
  booking: CancelBookingTarget | null;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (!booking) return;
    setPending(true);
    setError(null);
    const result = await cancelManualBookingAction({
      bookingId: booking.id,
      reason: reason.trim() || undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Booking cancelled");
    onOpenChange(false);
    router.refresh();
  }

  const whenLabel = booking
    ? new Date(booking.start_time).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      })
    : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {booking ? `${booking.guest_name} — ${whenLabel}. ` : ""}
            This cancels it on Cal.com too and can&apos;t be undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-booking-reason">Reason (optional)</Label>
          <Textarea
            id="cancel-booking-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
          >
            {pending ? "Cancelling…" : "Cancel booking"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`AlertDialogAction`'s `onClick` calls `e.preventDefault()` before the async call — Radix's `AlertDialog.Action` closes the dialog immediately on click by default, which would hide a failure error before `cancelManualBookingAction` even resolves. Closing is done manually via `onOpenChange(false)` only after `result.ok`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cancel-booking-alert-dialog.tsx
git commit -m "feat(bookings): add the cancel-booking confirm dialog"
```

---

### Task 6: Wire "Cancel booking" into `bookings-table.tsx`

**Files:**
- Modify: `components/bookings-table.tsx`

**Interfaces:**
- Consumes: `CancelBookingAlertDialog`, `type CancelBookingTarget` (Task 5).

`components/bookings-table.tsx` is 746 lines — past the ~400-line soft limit for hand-written logic (`.claude/rules/code-structure.md`). This task only adds ~20 lines of wiring (state + two dropdown items + one dialog render), not new business logic, so it does not warrant a split on its own — but do not add anything beyond this wiring to this file going forward without splitting it first.

- [ ] **Step 1: Add cancel-target state and import**

At the top of `components/bookings-table.tsx`, add the import:

```ts
import {
  CancelBookingAlertDialog,
  type CancelBookingTarget,
} from "@/components/cancel-booking-alert-dialog";
```

Inside `BookingsTable`, alongside the existing `selectedId`/`pageIndex`/`pageSize` state (currently lines 204-207):

```ts
  const [cancelTarget, setCancelTarget] = React.useState<CancelBookingTarget | null>(
    null,
  );
```

- [ ] **Step 2: Add "Cancel booking" to the row-list dropdown**

In the row-list `DropdownMenuContent` (currently ending with the `Copy Cal UID` item and its `DropdownMenuSeparator` at lines 416-428), add a cancellable-only item after `Copy Cal UID`:

```tsx
                              {rowView(row) !== "past" && rowView(row) !== "cancelled" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => {
                                      openAfterMenuClose(() =>
                                        setCancelTarget({
                                          id: row.id,
                                          guest_name: row.guest_name,
                                          start_time: row.start_time,
                                        }),
                                      );
                                    }}
                                  >
                                    Cancel booking
                                  </DropdownMenuItem>
                                </>
                              ) : null}
```

`DropdownMenuItem` already supports `variant="destructive"` (`components/ui/dropdown-menu.tsx:65-69`) — no new prop to add, just pass it.

- [ ] **Step 3: Add the same item to the detail-sheet dropdown**

`BookingDetailSheet` needs a way to reach `setCancelTarget`, which lives in the parent `BookingsTable`. Add a prop:

```tsx
function BookingDetailSheet({
  booking,
  timeZone,
  hostName,
  serviceMode = "onsite",
  onRequestCancel,
}: {
  booking: BookingRow;
  timeZone: string;
  hostName: string;
  serviceMode?: "onsite" | "online";
  onRequestCancel: (target: CancelBookingTarget) => void;
}) {
```

In its `DropdownMenuContent` (currently ending with the `Copy Cal UID` item at lines 730-739), add the same cancellable-only item, gated the same way:

```tsx
                            {rowView(booking) !== "past" &&
                            rowView(booking) !== "cancelled" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    openAfterMenuClose(() =>
                                      onRequestCancel({
                                        id: booking.id,
                                        guest_name: booking.guest_name,
                                        start_time: booking.start_time,
                                      }),
                                    );
                                  }}
                                >
                                  Cancel booking
                                </DropdownMenuItem>
                              </>
                            ) : null}
```

Pass the prop from `BookingsTable`'s render of `<BookingDetailSheet>` (currently lines 507-514):

```tsx
          {active ? (
            <BookingDetailSheet
              booking={active}
              hostName={hostName}
              onRequestCancel={setCancelTarget}
              serviceMode={serviceMode}
              timeZone={timeZone}
            />
          ) : null}
```

- [ ] **Step 4: Render the dialog**

At the end of `BookingsTable`'s JSX, right after the closing `</Sheet>` (currently line 516), before the closing `</div>`:

```tsx
      <CancelBookingAlertDialog
        booking={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        open={Boolean(cancelTarget)}
        timeZone={timeZone}
      />
```

- [ ] **Step 5: Add the "Cancelled by staff" badge**

In `BookingDetailSheet`'s badge row (currently lines 551-559), add the third branch this feature requires — without it, a staff-cancelled booking falls through the `if/else if` chain with no badge at all:

```tsx
          {booking.cancelled_by === "guest" ? (
            <Badge variant="secondary" className="text-xs">
              Cancelled by guest
            </Badge>
          ) : booking.cancelled_by === "cal" ? (
            <Badge variant="outline" className="text-xs">
              Cancelled on Cal.com
            </Badge>
          ) : booking.cancelled_by === "owner" ? (
            <Badge variant="secondary" className="text-xs">
              Cancelled by staff
            </Badge>
          ) : null}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Run react-doctor**

Run: `npm run doctor`
Expected: no new errors introduced by this file's changes.

- [ ] **Step 8: Commit**

```bash
git add components/bookings-table.tsx
git commit -m "feat(bookings): wire Cancel booking into the row and detail-sheet menus"
```

---

### Task 7: Manual end-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all tests pass, including the new files from Tasks 1 and 4, and `tests/agent-tools/cancel_appointment.test.ts` unchanged.

- [ ] **Step 2: Start the dev server and walk through the flow**

Run: `npm run dev` (or use the project's preview tooling)

As a staff user on a workspace with at least one upcoming booking:

1. Open `/dashboard/bookings`, Upcoming tab. Click the "..." menu on a row — confirm **Cancel booking** appears below a separator, styled destructive.
2. Click it. Confirm the `AlertDialog` opens naming the guest and the appointment time, with an optional reason field.
3. Click **Keep booking** — confirm the dialog closes and nothing changed.
4. Reopen it, type a reason, click **Cancel booking** (destructive). Confirm a "Booking cancelled" toast, the row disappears from Upcoming, and reappears under the Cancelled tab.
5. Open that row's detail sheet — confirm the badge reads "Cancelled by staff" and the "..." menu no longer offers Cancel booking.
6. Confirm the cancellation shows on Cal.com's calendar for that slot.
7. Open a **Cancelled** or **Past** row directly — confirm its "..." menu has no Cancel booking item at all (server already rejects it too, per Task 4's test, but the UI should not even offer it).
8. From the detail sheet of an **Upcoming** booking, use its own "..." menu's Cancel booking (not the row-list one) — confirm it cancels the same way and the sheet updates in place without closing.

- [ ] **Step 3: Update the knowledge graph**

Run: `graphify update .`
Expected: completes, `graphify-out/` updated.

- [ ] **Step 4: Final full-repo checks**

Run: `npm run typecheck && npm run doctor:full`
Expected: typecheck clean; doctor shows no new findings attributable to this feature's files.

- [ ] **Step 5: Commit the graph update**

```bash
git add graphify-out
git commit -m "chore(graphify): update graph after manual booking cancellation"
```
