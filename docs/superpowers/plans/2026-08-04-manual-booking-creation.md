# Manual Booking Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff on `/dashboard/bookings` create a real Cal.com booking from the dashboard, picking a real open slot, without leaving the app.

**Architecture:** A shared `lib/booking-create.ts` helper does the Cal.com-create + Supabase-mirror + lead-upsert + notification + analytics sequence that `agent/tools/book_appointment.ts` already does; both the AI agent tool and two new dashboard server actions (`getAvailableSlotsAction`, `createManualBookingAction`) call it instead of duplicating it. A new `components/new-booking-dialog.tsx` client component drives the two actions from a "New booking" button next to the existing "Sync Cal.com" button.

**Tech Stack:** Next.js App Router server actions, Supabase (Postgres + admin client), Cal.com API v2 (`lib/calcom.ts`), Vitest, `tests/helpers/supabase-mock.ts`.

## Global Constraints

- Never invent a slot: staff pick from real availability fetched from Cal.com, the same guarantee `check_availability.ts` / `book_appointment.ts` give the AI agent.
- Server actions return `{ ok: true, ... } | { ok: false, error }`, never throw past the boundary (matches `lib/conversation-handoff.ts`, `agent/tools/*.ts`).
- Workspace and staff identity come from `getDashboardUser()` on the server, never from the client (matches `app/dashboard/conversations/actions.ts` `requireStaff()`).
- Errors shown in the dashboard UI go through `APP_ERROR_CODE` / `appErrorMessage()` — never a raw Cal.com/DB string (`.claude/rules/errors.md` rule 1). This is stricter than `agent/tools/book_appointment.ts`, which returns raw Cal.com error text to the LLM — that text never reaches a human UI directly, so it is a different audience and does not set precedent here.
- No new role gate — `/dashboard/bookings` stays open to owner and staff.
- No i18n catalog wiring for this dialog — plain English literals, matching the established precedent in `components/conversations-table.tsx` / `components/conversation-detail-sheet.tsx` (dashboard-operator chrome outside the guest-facing `messages/*.json` split).
- Reuse before inventing: extend `lib/workspace-cal.ts` and `lib/sync-cal-bookings.ts` rather than duplicating their logic.
- After every task: `npm run typecheck` must pass. After UI tasks: `npm run doctor`. Commit after each task.
- `npx supabase db reset` before Task 1's migration step, and again after Task 1, is the only way to catch a migration-chain break — confirm with `ls supabase/migrations | tail -3` that no new migration landed on `main` since this plan was written before picking the next version number.

---

### Task 1: `created_by_staff_id` column + sync preservation

**Files:**
- Create: `supabase/migrations/20260804000001_bookings_created_by_staff.sql`
- Modify: `lib/sync-cal-bookings.ts:22-34` (type), `:84` (select), `:117-121` (row build)
- Test: `lib/sync-cal-bookings.test.ts`

**Interfaces:**
- Produces: `public.bookings.created_by_staff_id` (nullable uuid, FK to `public.profiles(id)`, `on delete set null`). Every later task that writes to `bookings` may set this column.

- [ ] **Step 1: Confirm the next migration version is free**

Run: `ls supabase/migrations | tail -3`
Expected: latest is `20260803000003_conversation_needs_reply_type.sql` — if something newer exists, pick the next free `YYYYMMDDHHMMSS` instead of `20260804000001` and use that number for every reference below.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20260804000001_bookings_created_by_staff.sql
alter table public.bookings
  add column created_by_staff_id uuid references public.profiles(id) on delete set null;

comment on column public.bookings.created_by_staff_id is
  'Set when a staff member created this booking from the dashboard. Null means it came from the chat agent or was created directly in Cal.com.';
```

- [ ] **Step 3: Apply it and confirm it doesn't break the chain**

Run: `npx supabase db reset`
Expected: reset completes, ends with `Finished supabase db reset`. If it fails with a `duplicate key value violates unique constraint "schema_migrations_pkey"`, another migration already claimed that version — rename the file to the next free version and re-run.

- [ ] **Step 4: Write the failing sync-preservation test**

Add to `lib/sync-cal-bookings.test.ts`, inside `describe("upsertCalBookings — tenant scoping", ...)`, after the existing `"still carries its own workspace's credentials forward"` test:

```ts
  it("preserves created_by_staff_id across a Cal.com sync", async () => {
    supabaseMock.seed("bookings", [
      {
        id: "booking-manual",
        workspace_id: WS_A,
        cal_booking_uid: SHARED_UID,
        status: "accepted",
        list_status: "upcoming",
        start_time: FUTURE,
        guest_name: "Guest A",
        guest_email: "a@example.com",
        created_by_staff_id: "staff-1",
        cancelled_by: null,
      },
    ]);

    await upsertCalBookings([calItem({ attendeeName: "Guest A" })], WS_A);

    const upserted = supabaseMock
      .insertsFor("bookings")
      .find((r) => r.workspace_id === WS_A);

    expect(upserted?.created_by_staff_id).toBe("staff-1");
  });
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run lib/sync-cal-bookings.test.ts`
Expected: FAIL — `upserted?.created_by_staff_id` is `undefined`, not `"staff-1"` (the column isn't read/preserved yet).

- [ ] **Step 6: Add `created_by_staff_id` to the `ExistingBooking` type**

In `lib/sync-cal-bookings.ts`, extend the type at line 22:

```ts
type ExistingBooking = {
  cal_booking_uid: string;
  status: string;
  start_time: string;
  guest_name: string | null;
  guest_email: string | null;
  session_id: string | null;
  visitor_id: string | null;
  chat_session_id: string | null;
  manage_code_hash: string | null;
  cancelled_by: string | null;
  guest_timezone: string | null;
  created_by_staff_id: string | null;
};
```

- [ ] **Step 7: Read and preserve the column**

In `lib/sync-cal-bookings.ts`, add `created_by_staff_id` to the existing-row `select(...)` string (currently at line 84):

```ts
        .select(
          "cal_booking_uid, status, start_time, guest_name, guest_email, session_id, visitor_id, chat_session_id, manage_code_hash, cancelled_by, guest_timezone, created_by_staff_id",
        )
```

Then add it to the upserted row object (currently ends `guest_timezone: prev?.guest_timezone ?? null,` around line 121):

```ts
      guest_timezone: prev?.guest_timezone ?? null,
      created_by_staff_id: prev?.created_by_staff_id ?? null,
```

- [ ] **Step 8: Run the test again to verify it passes**

Run: `npx vitest run lib/sync-cal-bookings.test.ts`
Expected: PASS, all tests in the file green (the new one plus the three existing tenant-scoping tests, unaffected).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260804000001_bookings_created_by_staff.sql lib/sync-cal-bookings.ts lib/sync-cal-bookings.test.ts
git commit -m "feat(bookings): add created_by_staff_id and preserve it on sync"
```

---

### Task 2: `lib/booking-create.ts` — shared Cal.com + Supabase booking helper

**Files:**
- Create: `lib/booking-create.ts`
- Test: `lib/booking-create.test.ts`

**Interfaces:**
- Consumes: `createBooking`, `type CreateBookingResult` from `@/lib/calcom`; `generateManageCode`, `hashBookingCode` from `@/lib/booking-manage-code`; `normalizeCalApiStatus` from `@/lib/booking-status`; `formatSlotForGuest` from `@/lib/guest-timezone`; `upsertLeadAsBooked` from `@/lib/leads`; `createNotification` from `@/lib/notifications-write`; `createAdminClient` from `@/lib/supabase/admin`; `ANALYTICS_EVENT` from `@/lib/analytics-events`; `trackServer` from `@/lib/analytics-server`.
- Produces: `createWorkspaceBooking(input: CreateWorkspaceBookingInput): Promise<CreateWorkspaceBookingResult>`, `type CreateWorkspaceBookingInput`, `type CreateWorkspaceBookingResult` — used by Task 3 (agent tool) and Task 4 (dashboard action). **Precondition the caller must satisfy:** the call must happen inside `withCalApiKey(apiKey, () => createWorkspaceBooking(input))` — this function does not fetch or apply the Cal.com API key itself, exactly like `createBooking()` in `lib/calcom.ts` doesn't.

- [ ] **Step 1: Write the failing test file**

Create `lib/booking-create.test.ts`:

```ts
/**
 * createWorkspaceBooking unit tests. Supabase is mocked globally via
 * tests/setup.ts. Cal.com's createBooking is mocked here — this is the
 * layer below withCalApiKey, so no API key handling to fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock, QueryBuilder } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    createBooking: vi.fn(),
  };
});
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/analytics-server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/leads", () => ({
  upsertLeadAsBooked: vi.fn().mockResolvedValue(undefined),
}));

const WS = "00000000-0000-4000-8000-000000000001";
const SLOT = "2026-08-05T09:00:00.000Z";

function baseInput(overrides?: Record<string, unknown>) {
  return {
    workspaceId: WS,
    eventRef: { eventTypeId: 123, eventTypeSlug: "consultation-30", username: "biz" },
    eventTitle: "Consultation",
    start: SLOT,
    guestName: "Nguyen Van A",
    phone: "+84123456789",
    email: "a@example.com",
    timeZone: "Asia/Ho_Chi_Minh",
    source: "chat" as const,
    ...overrides,
  };
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("createWorkspaceBooking", () => {
  it("creates the booking and mirrors it with source: chat leaving created_by_staff_id null", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_1",
      start: SLOT,
      status: "confirmed",
      meetingUrl: "https://cal.com/meeting/cal_uid_1",
      raw: { id: 1 },
    });

    const { createWorkspaceBooking } = await import("./booking-create");
    const result = await createWorkspaceBooking(baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.uid).toBe("cal_uid_1");
      expect(result.manageCode.length).toBeGreaterThanOrEqual(6);
    }

    const inserts = supabaseMock.insertsFor("bookings");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      workspace_id: WS,
      cal_booking_uid: "cal_uid_1",
      guest_name: "Nguyen Van A",
      created_by_staff_id: null,
    });
  });

  it("sets created_by_staff_id when source is staff", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_2",
      start: SLOT,
      status: "confirmed",
      meetingUrl: null,
      raw: {},
    });

    const { createWorkspaceBooking } = await import("./booking-create");
    await createWorkspaceBooking(
      baseInput({ source: "staff", staffUserId: "staff-42" }),
    );

    const inserts = supabaseMock.insertsFor("bookings");
    expect(inserts[0]).toMatchObject({ created_by_staff_id: "staff-42" });
  });

  it("returns ok:true with a warning when Cal.com succeeds but the Supabase mirror fails", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_3",
      start: SLOT,
      status: "confirmed",
      meetingUrl: null,
      raw: {},
    });

    vi.spyOn(QueryBuilder.prototype, "upsert").mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    const { createWorkspaceBooking } = await import("./booking-create");
    const result = await createWorkspaceBooking(baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.uid).toBe("cal_uid_3");
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("mirror");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/booking-create.test.ts`
Expected: FAIL — `Cannot find module './booking-create'` (file doesn't exist yet).

- [ ] **Step 3: Write `lib/booking-create.ts`**

Ported from `agent/tools/book_appointment.ts` lines 128-304 (the create + mirror + lead + notify + track sequence and its DB-mirror-failure fallback), generalized with `source`/`staffUserId` and the new `created_by_staff_id` column:

```ts
/**
 * The single place that turns a confirmed Cal.com slot into a real booking:
 * calls Cal.com, mirrors the row into Supabase, upserts the matching lead,
 * notifies the workspace, and tracks analytics. `agent/tools/book_appointment.ts`
 * (the AI agent) and the dashboard's manual-booking action both call this
 * instead of duplicating the sequence.
 *
 * Caller must already be inside `withCalApiKey(apiKey, () => ...)` — this
 * function does not touch the API key itself.
 */
import { createBooking, type CreateBookingResult } from "@/lib/calcom";
import {
  generateManageCode,
  hashBookingCode,
} from "@/lib/booking-manage-code";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { upsertLeadAsBooked } from "@/lib/leads";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";

export type CreateWorkspaceBookingInput = {
  workspaceId: string;
  eventRef: { eventTypeId?: number; eventTypeSlug: string; username: string };
  eventTitle: string;
  /** ISO start time — caller has already confirmed it is still open. */
  start: string;
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
  /** Required when source === "staff"; ignored otherwise. */
  staffUserId?: string | null;
};

export type CreateWorkspaceBookingResult =
  | {
      ok: true;
      booking: {
        uid: string;
        start: string;
        status: string;
        meetingUrl: string | null;
        display: string;
      };
      manageCode: string;
      warning?: string;
    }
  | { ok: false; error: string };

function buildBookingRow(
  input: CreateWorkspaceBookingInput,
  booking: CreateBookingResult,
  manageCodeHash: string,
) {
  return {
    workspace_id: input.workspaceId,
    cal_booking_uid: booking.uid,
    guest_name: input.guestName,
    guest_phone: input.phone,
    guest_email: input.email,
    service: input.service ?? input.eventTitle ?? null,
    start_time: booking.start,
    status: normalizeCalApiStatus(booking.status),
    list_status: "upcoming",
    notes: input.notes ?? null,
    session_id: input.sessionId ?? null,
    visitor_id: input.visitorId ?? null,
    chat_session_id: input.chatSessionId ?? null,
    manage_code_hash: manageCodeHash,
    guest_timezone: input.guestTimeZone ?? null,
    created_by_staff_id:
      input.source === "staff" ? (input.staffUserId ?? null) : null,
    raw: booking.raw,
  };
}

export async function createWorkspaceBooking(
  input: CreateWorkspaceBookingInput,
): Promise<CreateWorkspaceBookingResult> {
  const booking = await createBooking({
    start: input.start,
    attendeeName: input.guestName,
    attendeeEmail: input.email,
    attendeePhone: input.phone,
    timeZone: input.timeZone,
    language: input.locale,
    notes:
      [input.service, input.notes].filter(Boolean).join(" | ") || undefined,
    ...input.eventRef,
  });

  const manageCode = generateManageCode();
  const manageCodeHash = hashBookingCode(manageCode);
  const startDisplay = formatSlotForGuest(
    booking.start,
    input.guestTimeZone ?? null,
    input.timeZone,
  );
  const row = buildBookingRow(input, booking, manageCodeHash);

  try {
    const supabase = createAdminClient();
    await supabase
      .from("bookings")
      .upsert(row, { onConflict: "workspace_id,cal_booking_uid" });

    await upsertLeadAsBooked({
      workspaceId: input.workspaceId,
      fullName: input.guestName,
      phone: input.phone,
      email: input.email,
      service: input.service ?? input.eventTitle ?? null,
      notes: input.notes ?? null,
      sessionId: input.sessionId,
    });

    await createNotification({
      type: "booking_created",
      title: `New booking: ${input.guestName}`,
      body: [input.service ?? input.eventTitle, booking.start, input.phone]
        .filter(Boolean)
        .join(" · "),
      severity: "high",
      href: "/dashboard/bookings",
      entityType: "booking",
      entityId: booking.uid,
      workspaceId: input.workspaceId,
    });
    await trackServer(ANALYTICS_EVENT.BOOKING_CREATED, input.workspaceId, {
      workspaceId: input.workspaceId,
      service: input.service ?? input.eventTitle ?? null,
      source: input.source,
    });
  } catch (dbError) {
    const warning =
      dbError instanceof Error
        ? `Saved on Cal.com but failed to mirror to Supabase: ${dbError.message}`
        : "Saved on Cal.com but failed to mirror to Supabase";
    try {
      const supabase = createAdminClient();
      await supabase
        .from("bookings")
        .upsert(row, { onConflict: "workspace_id,cal_booking_uid" });
    } catch {
      // ignore second failure — still return manageCode below
    }
    await createNotification({
      type: "booking_mirror_failed",
      title: `Cal.com booking saved but not mirrored to DB`,
      body: `${input.guestName} · ${booking.start} · ${warning}`,
      severity: "medium",
      href: "/dashboard/bookings",
      entityType: "booking",
      entityId: booking.uid,
      workspaceId: input.workspaceId,
    });
    return {
      ok: true,
      booking: {
        uid: booking.uid,
        start: booking.start,
        status: booking.status,
        meetingUrl: booking.meetingUrl ?? null,
        display: startDisplay.combined,
      },
      manageCode,
      warning,
    };
  }

  return {
    ok: true,
    booking: {
      uid: booking.uid,
      start: booking.start,
      status: booking.status,
      meetingUrl: booking.meetingUrl ?? null,
      display: startDisplay.combined,
    },
    manageCode,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/booking-create.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/booking-create.ts lib/booking-create.test.ts
git commit -m "feat(bookings): extract createWorkspaceBooking shared helper"
```

---

### Task 3: Refactor `book_appointment.ts` to use the shared helper

**Files:**
- Modify: `agent/tools/book_appointment.ts`
- Test: `tests/agent-tools/book_appointment.test.ts` (must pass unchanged — behavior-preservation check, no edits to this file)

**Interfaces:**
- Consumes: `createWorkspaceBooking`, `type CreateWorkspaceBookingResult` from `@/lib/booking-create` (Task 2).

This is a **behavior-preserving refactor**. `tests/agent-tools/book_appointment.test.ts` already covers every branch this touches (happy path, no-AI-event-type, no-Cal-key, slot-no-longer-open, DB-mirror-failure). If any of its assertions need to change to pass, stop — that means the refactor changed behavior, which is out of scope here.

- [ ] **Step 1: Run the existing test to confirm the starting baseline is green**

Run: `npx vitest run tests/agent-tools/book_appointment.test.ts`
Expected: PASS, all 5 tests green (this is the pre-refactor baseline).

- [ ] **Step 2: Replace the create+mirror sequence with a call to `createWorkspaceBooking`**

In `agent/tools/book_appointment.ts`, replace the whole block from `const booking = await withCalApiKey(...)` (current line 128) through the end of the function's success/mirror-fail returns (current line 287, just before the final `catch` at line 305) with:

```ts
      const guestActor = await resolveGuestBookingActor({
        sessionId: sid,
        auth,
      });
      const visitorId = guestActor.ok ? guestActor.actor.visitorId : null;
      const chatSessionId = guestActor.ok
        ? guestActor.actor.chatSessionId
        : null;
      const guestTzResolved = await resolveGuestTimeZone({
        auth,
        chatSessionId,
      });
      const guestTimeZone =
        ws?.service_mode === "online" ? guestTzResolved.guestTimeZone : null;

      const result = await withCalApiKey(apiKey, () =>
        createWorkspaceBooking({
          workspaceId,
          eventRef,
          eventTitle: aiEvent.title,
          start,
          guestName,
          phone,
          email,
          timeZone,
          locale,
          notes,
          service,
          sessionId: sid,
          visitorId,
          chatSessionId,
          guestTimeZone,
          source: "chat",
        }),
      );

      if (!result.ok) {
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error: result.error,
          sessionId: sid,
          workspaceId,
        });
        return result;
      }

      await logAgentToolEvent({
        toolName: "book_appointment",
        ok: true,
        sessionId: sid,
        workspaceId,
        meta: {
          uid: result.booking.uid,
          ...(result.warning ? { mirrorFailed: true } : {}),
        },
      });

      return {
        ok: true as const,
        booking: {
          uid: result.booking.uid,
          start: result.booking.start,
          status: result.booking.status,
          meetingUrl: result.booking.meetingUrl,
          eventTypeId: aiEvent.calEventTypeId || null,
          eventTypeSlug: aiEvent.slug,
          display: result.booking.display,
          guestTimeZone,
          businessTimeZone: timeZone,
        },
        ...(result.warning ? { warning: result.warning } : {}),
        /** Tell the guest once — will be redacted when persisted. */
        manageCode: result.manageCode,
      };
```

Note `createWorkspaceBooking`'s type never returns `{ ok: false }` today (Cal.com failures throw, caught by the outer `catch` below, matching current behavior exactly) — the `if (!result.ok)` branch above is dead code for now but keeps this call site correct if that ever changes, and satisfies the discriminated-union type without an `as` cast.

Add the import at the top of the file:

```ts
import { createWorkspaceBooking } from "@/lib/booking-create";
```

Remove now-unused imports from the top of the file: `generateManageCode`, `hashBookingCode` (from `@/lib/booking-manage-code`), `normalizeCalApiStatus` (from `@/lib/booking-status`), `upsertLeadAsBooked` (from `@/lib/leads`), `createNotification` (from `@/lib/notifications-write`), `createAdminClient` (from `@/lib/supabase/admin`), `ANALYTICS_EVENT` (from `@/lib/analytics-events`), `trackServer` (from `@/lib/analytics-server`). Keep `formatSlotForGuest`, `calendarDayInTimeZone` (still used by the `stillOpen` check above this block), `resolveGuestBookingActor`, `resolveGuestTimeZone`.

- [ ] **Step 3: Run the existing test again to verify no regression**

Run: `npx vitest run tests/agent-tools/book_appointment.test.ts`
Expected: PASS, same 5 tests green, no assertion changed. If any assertion now fails, revert Step 2 and re-check the ported logic in Task 2 against the original `book_appointment.ts` lines 128-304 line by line — do not edit the test file to make it pass.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this also catches any leftover unused import from Step 2).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass, same total count as before this task.

- [ ] **Step 6: Commit**

```bash
git add agent/tools/book_appointment.ts
git commit -m "refactor(agent): use the shared createWorkspaceBooking helper"
```

---

### Task 4: Dashboard server actions — `getAvailableSlotsAction` + `createManualBookingAction`

**Files:**
- Modify: `lib/workspace-cal.ts` (add `getWorkspaceEventTypeById`, `eventRefFromMeetingType`)
- Modify: `lib/errors/app-codes.ts`, `lib/errors/app-messages.ts` (add `BOOKING_CREATE_FAILED`)
- Create: `app/dashboard/bookings/actions.ts`
- Test: `app/dashboard/bookings/actions.test.ts`

**Interfaces:**
- Consumes: `createWorkspaceBooking` (Task 2); `getDashboardUser` from `@/lib/dashboard-user`; `getWorkspaceById`, `getCalApiKeyForWorkspace` from `@/lib/workspace`; `withCalApiKey`, `getAvailableSlots` from `@/lib/calcom`; `formatSlotForGuest` from `@/lib/guest-timezone`; `todayYmd`, `compareYmd` from `@/agent/date-context`; `APP_ERROR_CODE`, `appErrorMessage` from `@/lib/errors`.
- Produces: `getAvailableSlotsAction(input: { meetingTypeId: string; date: string }): Promise<{ ok: true; slots: { start: string; display: string }[] } | { ok: false; error: string }>`, `createManualBookingAction(input: { meetingTypeId: string; start: string; guestName: string; phone: string; email: string; notes?: string }): Promise<{ ok: true; bookingUid: string } | { ok: false; error: string }>` — used by Task 5's dialog.

- [ ] **Step 1: Add the two `lib/workspace-cal.ts` helpers**

Append to `lib/workspace-cal.ts` (after `listWorkspaceEventTypes`):

```ts
/** A single meeting type, scoped to its workspace — never a bare-id read. */
export async function getWorkspaceEventTypeById(
  workspaceId: string,
  id: string,
): Promise<WorkspaceEventTypeRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_event_types")
    .select(
      "id, workspace_id, cal_event_type_id, slug, title, length_minutes, minimum_notice_minutes, is_ai_booking, synced_at, created_at, updated_at, raw",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as WorkspaceEventTypeRow) ?? null;
}

export function eventRefFromMeetingType(
  row: Pick<WorkspaceEventTypeRow, "cal_event_type_id" | "slug">,
  username: string,
): { eventTypeId?: number; eventTypeSlug: string; username: string } {
  return {
    eventTypeId: row.cal_event_type_id || undefined,
    eventTypeSlug: row.slug,
    username,
  };
}
```

- [ ] **Step 2: Add the `BOOKING_CREATE_FAILED` error code**

In `lib/errors/app-codes.ts`, add one line at the end of the `APP_ERROR_CODE` object (after `CONVERSATION_NO_WORKSPACE`):

```ts
  BOOKING_CREATE_FAILED: "booking_create_failed",
```

In `lib/errors/app-messages.ts`, add the matching entry at the end of `APP_ERROR_MESSAGE` (after `CONVERSATION_NO_WORKSPACE`):

```ts
  [APP_ERROR_CODE.BOOKING_CREATE_FAILED]:
    "Could not create the booking. The slot may no longer be available — pick another time and try again.",
```

(TypeScript's `satisfies Record<AppErrorCode, string>` on `APP_ERROR_MESSAGE` will fail to compile if this entry is missing — Step 6's typecheck catches a skipped message.)

- [ ] **Step 3: Write the failing test file**

Create `app/dashboard/bookings/actions.test.ts`:

```ts
/**
 * Dashboard manual-booking actions. Workspace/staff identity is mocked via
 * getDashboardUser — never trust a client-supplied workspaceId. Supabase is
 * mocked globally via tests/setup.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../tests/helpers/supabase-mock";

const WS = "00000000-0000-4000-8000-000000000001";
const OTHER_WS = "00000000-0000-4000-8000-000000000002";
const SLOT = "2026-08-05T09:00:00.000Z";

const mocks = vi.hoisted(() => ({
  getDashboardUser: vi.fn(),
  getAvailableSlots: vi.fn(),
  createWorkspaceBooking: vi.fn(),
}));

vi.mock("@/lib/dashboard-user", () => ({
  getDashboardUser: mocks.getDashboardUser,
}));
vi.mock("@/lib/calcom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calcom")>()),
  getAvailableSlots: mocks.getAvailableSlots,
}));
vi.mock("@/lib/booking-create", () => ({
  createWorkspaceBooking: mocks.createWorkspaceBooking,
}));

function seedMeetingType(overrides?: Record<string, unknown>) {
  supabaseMock.seed("workspace_event_types", [
    {
      id: "evt-1",
      workspace_id: WS,
      cal_event_type_id: 123,
      title: "Consultation",
      slug: "consultation-30",
      length_minutes: 30,
      minimum_notice_minutes: 60,
      is_ai_booking: false,
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
      cal_event_type_id: null,
      cal_event_type_slug: null,
      cal_api_key_encrypted: "encrypted-key",
      service_mode: "onsite",
    },
  ]);
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  mocks.getDashboardUser.mockResolvedValue({
    navUser: { name: "Staff One", email: "staff@acme.test", avatar: "" },
    userId: "staff-1",
    workspaceId: WS,
    workspaceSlug: "acme",
    bookingPagePath: "/b/acme",
    role: "owner",
  });
});

describe("getAvailableSlotsAction", () => {
  it("returns slots for a meeting type in the caller's workspace", async () => {
    seedMeetingType();
    mocks.getAvailableSlots.mockResolvedValue([{ start: SLOT }]);

    const { getAvailableSlotsAction } = await import("./actions");
    const result = await getAvailableSlotsAction({
      meetingTypeId: "evt-1",
      date: "2026-08-05",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slots).toHaveLength(1);
      expect(result.slots[0]?.start).toBe(SLOT);
    }
  });

  it("refuses a meeting type id from another workspace", async () => {
    seedMeetingType({ workspace_id: OTHER_WS });

    const { getAvailableSlotsAction } = await import("./actions");
    const result = await getAvailableSlotsAction({
      meetingTypeId: "evt-1",
      date: "2026-08-05",
    });

    expect(result.ok).toBe(false);
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("rejects a past date without calling Cal.com", async () => {
    seedMeetingType();

    const { getAvailableSlotsAction } = await import("./actions");
    const result = await getAvailableSlotsAction({
      meetingTypeId: "evt-1",
      date: "2020-01-01",
    });

    expect(result.ok).toBe(false);
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });
});

describe("createManualBookingAction", () => {
  it("creates a booking with source: staff and the caller's staffUserId", async () => {
    seedMeetingType();
    mocks.createWorkspaceBooking.mockResolvedValue({
      ok: true,
      booking: { uid: "cal_uid_9", start: SLOT, status: "confirmed", meetingUrl: null, display: SLOT },
      manageCode: "ABC123",
    });

    const { createManualBookingAction } = await import("./actions");
    const result = await createManualBookingAction({
      meetingTypeId: "evt-1",
      start: SLOT,
      guestName: "Nguyen Van A",
      phone: "+84123456789",
      email: "a@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bookingUid).toBe("cal_uid_9");
    expect(mocks.createWorkspaceBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        source: "staff",
        staffUserId: "staff-1",
        guestName: "Nguyen Van A",
      }),
    );
  });

  it("rejects a meeting type id from another workspace without calling Cal.com", async () => {
    seedMeetingType({ workspace_id: OTHER_WS });

    const { createManualBookingAction } = await import("./actions");
    const result = await createManualBookingAction({
      meetingTypeId: "evt-1",
      start: SLOT,
      guestName: "Test",
      phone: "+84123456789",
      email: "test@example.com",
    });

    expect(result.ok).toBe(false);
    expect(mocks.createWorkspaceBooking).not.toHaveBeenCalled();
  });

  it("wraps a Cal.com failure in the generic error code, not the raw message", async () => {
    seedMeetingType();
    mocks.createWorkspaceBooking.mockRejectedValue(
      new Error("Cal.com says: no_available_users_found_error"),
    );

    const { createManualBookingAction } = await import("./actions");
    const result = await createManualBookingAction({
      meetingTypeId: "evt-1",
      start: SLOT,
      guestName: "Test",
      phone: "+84123456789",
      email: "test@example.com",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("no_available_users_found_error");
    }
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run app/dashboard/bookings/actions.test.ts`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 5: Write `app/dashboard/bookings/actions.ts`**

```ts
"use server";

import {
  eventRefFromMeetingType,
  getWorkspaceEventTypeById,
} from "@/lib/workspace-cal";
import { createWorkspaceBooking } from "@/lib/booking-create";
import { getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { getDashboardUser } from "@/lib/dashboard-user";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { getCalApiKeyForWorkspace, getWorkspaceById } from "@/lib/workspace";
import { compareYmd, todayYmd } from "@/agent/date-context";

/**
 * Workspace and identity come from the server session only — the
 * meetingTypeId argument each action below takes is a lookup key, scoped by
 * workspace on every read, never an authority.
 */
async function requireStaff(): Promise<
  | { error: string }
  | { workspaceId: string; staffUserId: string; timeZone: string }
> {
  const user = await getDashboardUser();
  if (!user) return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  if (!user.workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }
  const ws = await getWorkspaceById(user.workspaceId);
  return {
    workspaceId: user.workspaceId,
    staffUserId: user.userId,
    timeZone: ws?.timezone ?? "UTC",
  };
}

async function resolveEventRef(workspaceId: string, meetingTypeId: string) {
  const [meetingType, ws] = await Promise.all([
    getWorkspaceEventTypeById(workspaceId, meetingTypeId),
    getWorkspaceById(workspaceId),
  ]);
  if (!meetingType) return null;
  const username = ws?.cal_username || "";
  return {
    meetingType,
    eventRef: eventRefFromMeetingType(meetingType, username),
  };
}

export async function getAvailableSlotsAction(input: {
  meetingTypeId: string;
  date: string;
}): Promise<
  | { ok: true; slots: { start: string; display: string }[] }
  | { ok: false; error: string }
> {
  const ctx = await requireStaff();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (compareYmd(input.date, todayYmd(ctx.timeZone)) < 0) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const resolved = await resolveEventRef(ctx.workspaceId, input.meetingTypeId);
  if (!resolved) {
    return {
      ok: false,
      error: appErrorMessage(APP_ERROR_CODE.MEETING_TYPE_NOT_FOUND),
    };
  }

  let apiKey: string;
  try {
    apiKey = await getCalApiKeyForWorkspace(ctx.workspaceId);
  } catch {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
  }

  try {
    const rawSlots = await withCalApiKey(apiKey, () =>
      getAvailableSlots({
        startDate: input.date,
        endDate: input.date,
        timeZone: ctx.timeZone,
        ...resolved.eventRef,
      }),
    );
    const slots = rawSlots.map((slot) => ({
      start: slot.start,
      display: formatSlotForGuest(slot.start, null, ctx.timeZone).business,
    }));
    return { ok: true, slots };
  } catch (error) {
    console.error("[bookings] getAvailableSlotsAction failed", error);
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CREATE_FAILED) };
  }
}

export async function createManualBookingAction(input: {
  meetingTypeId: string;
  start: string;
  guestName: string;
  phone: string;
  email: string;
  notes?: string;
}): Promise<{ ok: true; bookingUid: string } | { ok: false; error: string }> {
  const ctx = await requireStaff();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (!input.guestName.trim() || !input.phone.trim() || !input.email.trim()) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const resolved = await resolveEventRef(ctx.workspaceId, input.meetingTypeId);
  if (!resolved) {
    return {
      ok: false,
      error: appErrorMessage(APP_ERROR_CODE.MEETING_TYPE_NOT_FOUND),
    };
  }

  let apiKey: string;
  try {
    apiKey = await getCalApiKeyForWorkspace(ctx.workspaceId);
  } catch {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
  }

  try {
    const result = await withCalApiKey(apiKey, () =>
      createWorkspaceBooking({
        workspaceId: ctx.workspaceId,
        eventRef: resolved.eventRef,
        eventTitle: resolved.meetingType.title,
        start: input.start,
        guestName: input.guestName.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        timeZone: ctx.timeZone,
        notes: input.notes,
        source: "staff",
        staffUserId: ctx.staffUserId,
      }),
    );
    if (!result.ok) {
      console.error("[bookings] createManualBookingAction failed", result.error);
      return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CREATE_FAILED) };
    }
    return { ok: true, bookingUid: result.booking.uid };
  } catch (error) {
    console.error("[bookings] createManualBookingAction failed", error);
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CREATE_FAILED) };
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run app/dashboard/bookings/actions.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors — this is what catches a missing `APP_ERROR_MESSAGE` entry from Step 2.

- [ ] **Step 8: Commit**

```bash
git add lib/workspace-cal.ts lib/errors/app-codes.ts lib/errors/app-messages.ts app/dashboard/bookings/actions.ts app/dashboard/bookings/actions.test.ts
git commit -m "feat(bookings): add getAvailableSlotsAction and createManualBookingAction"
```

---

### Task 5: `components/new-booking-dialog.tsx`

**Files:**
- Create: `components/new-booking-dialog.tsx`

**Interfaces:**
- Consumes: `getAvailableSlotsAction`, `createManualBookingAction` (Task 4); `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger` from `@/components/ui/dialog`; `Button`, `Input`, `Label`, `Select*`, `Textarea` from `@/components/ui/*`.
- Produces: `NewBookingDialog({ meetingTypes }: { meetingTypes: NewBookingMeetingType[] })`, `type NewBookingMeetingType = { id: string; title: string; lengthMinutes: number }` — used by Task 6.

No dedicated test file — this is a client component driving two already-unit-tested server actions; it is covered by the manual verification in Task 8, matching how `components/conversation-detail-sheet.tsx` has no test file either.

- [ ] **Step 1: Write the component**

Create `components/new-booking-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createManualBookingAction,
  getAvailableSlotsAction,
} from "@/app/dashboard/bookings/actions";

export type NewBookingMeetingType = {
  id: string;
  title: string;
  lengthMinutes: number;
};

type SlotOption = { start: string; display: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewBookingDialog({
  meetingTypes,
}: {
  meetingTypes: NewBookingMeetingType[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [meetingTypeId, setMeetingTypeId] = React.useState(
    meetingTypes[0]?.id ?? "",
  );
  const [date, setDate] = React.useState("");
  const [slots, setSlots] = React.useState<SlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [selectedStart, setSelectedStart] = React.useState<string | null>(
    null,
  );

  const loadSlots = React.useCallback(
    async (nextMeetingTypeId: string, nextDate: string) => {
      if (!nextMeetingTypeId || !nextDate) return;
      setSlotsLoading(true);
      setSlotsError(null);
      setSelectedStart(null);
      const result = await getAvailableSlotsAction({
        meetingTypeId: nextMeetingTypeId,
        date: nextDate,
      });
      setSlotsLoading(false);
      if (!result.ok) {
        setSlots([]);
        setSlotsError(result.error);
        return;
      }
      setSlots(result.slots);
    },
    [],
  );

  function resetForm() {
    setDate("");
    setSlots([]);
    setSlotsError(null);
    setSelectedStart(null);
  }

  const [submitState, submitAction, submitPending] = React.useActionState(
    async (
      _prev: { error?: string } | null,
      formData: FormData,
    ): Promise<{ error?: string } | null> => {
      if (!selectedStart) return { error: "Pick a time slot first." };
      const guestName = String(formData.get("guestName") ?? "").trim();
      const phone = String(formData.get("phone") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim();
      const notes = String(formData.get("notes") ?? "").trim();
      if (!guestName || !phone || !email) {
        return { error: "Name, phone, and email are required." };
      }

      const result = await createManualBookingAction({
        meetingTypeId,
        start: selectedStart,
        guestName,
        phone,
        email,
        notes: notes || undefined,
      });
      if (!result.ok) return { error: result.error };

      toast.success("Booking created");
      setOpen(false);
      resetForm();
      router.refresh();
      return null;
    },
    null,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={meetingTypes.length === 0}>
          New booking
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Pick a real open slot — the same calendar the AI agent checks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-booking-meeting-type">Meeting type</Label>
          <Select
            value={meetingTypeId}
            onValueChange={(value) => {
              setMeetingTypeId(value);
              if (date) void loadSlots(value, date);
            }}
          >
            <SelectTrigger id="new-booking-meeting-type">
              <SelectValue placeholder="Select a meeting type" />
            </SelectTrigger>
            <SelectContent>
              {meetingTypes.map((mt) => (
                <SelectItem key={mt.id} value={mt.id}>
                  {mt.title} · {mt.lengthMinutes} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-booking-date">Date</Label>
          <Input
            id="new-booking-date"
            type="date"
            value={date}
            min={todayIso()}
            onChange={(e) => {
              setDate(e.target.value);
              if (meetingTypeId) void loadSlots(meetingTypeId, e.target.value);
            }}
          />
        </div>

        {slotsLoading ? (
          <p className="text-muted-foreground text-sm">
            Loading open slots…
          </p>
        ) : slotsError ? (
          <p className="text-destructive text-sm">{slotsError}</p>
        ) : date && slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open slots this day.
          </p>
        ) : slots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <Button
                key={slot.start}
                type="button"
                size="sm"
                variant={selectedStart === slot.start ? "default" : "outline"}
                onClick={() => setSelectedStart(slot.start)}
              >
                {slot.display}
              </Button>
            ))}
          </div>
        ) : null}

        <form action={submitAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new-booking-guest-name">Guest name</Label>
            <Input id="new-booking-guest-name" name="guestName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-booking-phone">Phone</Label>
            <Input id="new-booking-phone" name="phone" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-booking-email">Email</Label>
            <Input id="new-booking-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-booking-notes">Notes (optional)</Label>
            <Textarea id="new-booking-notes" name="notes" />
          </div>

          {submitState?.error ? (
            <p className="text-destructive text-sm">{submitState.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={submitPending || !selectedStart}>
              {submitPending ? "Creating…" : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note the `<Input>` fields inside the final `<form>` are uncontrolled (no `value`/`onChange`) unlike the meeting-type/date/slot pickers above them — those live outside the form because the slot fetch needs to react to them before submit exists at all. React resetting an uncontrolled field after `submitAction` settles is fine here (unlike the staff-reply composer in `conversation-detail-sheet.tsx`, which keeps a draft the user might want back after a failed send): a failed manual booking should be re-filled deliberately, not silently repopulated with a guest's name from a different attempt.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/new-booking-dialog.tsx
git commit -m "feat(bookings): add the new-booking dialog component"
```

---

### Task 6: Wire the "New booking" button into `/dashboard/bookings`

**Files:**
- Modify: `app/dashboard/bookings/page.tsx`

**Interfaces:**
- Consumes: `NewBookingDialog`, `type NewBookingMeetingType` (Task 5); `listWorkspaceMeetingTypes` from `@/lib/workspace-cal` (already exists).

- [ ] **Step 1: Load meeting types and render the dialog next to Sync**

In `app/dashboard/bookings/page.tsx`, add the import:

```ts
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
```

Add `listWorkspaceMeetingTypes(workspaceId)` to the existing `Promise.all` that loads `bookings` and `workspace` (currently lines 27-41):

```ts
  const [{ data: bookings }, { data: workspace }, meetingTypes] =
    await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, guest_name, guest_phone, guest_email, start_time, status, list_status, cancelled_by, guest_timezone, service, cal_booking_uid, session_id, synced_at, raw",
        )
        .eq("workspace_id", workspaceId)
        .order("start_time", { ascending: false })
        .limit(100),
      supabase
        .from("workspaces")
        .select("name, timezone, service_mode")
        .eq("id", workspaceId)
        .maybeSingle(),
      listWorkspaceMeetingTypes(workspaceId),
    ]);
```

Replace the row that currently only renders `<BookingsSyncButton />` (line 101):

```tsx
            <div className="flex items-center gap-2">
              <NewBookingDialog
                meetingTypes={meetingTypes.map((mt) => ({
                  id: mt.id,
                  title: mt.title,
                  lengthMinutes: mt.length_minutes,
                }))}
              />
              <BookingsSyncButton />
            </div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run react-doctor**

Run: `npm run doctor`
Expected: no new errors introduced by this page's changes (pre-existing findings elsewhere in the repo, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/bookings/page.tsx
git commit -m "feat(bookings): wire the New booking dialog into the bookings page"
```

---

### Task 7: "Booked by {name}" badge on manually-created bookings

**Files:**
- Modify: `app/dashboard/bookings/page.tsx` (staff-name join)
- Modify: `components/bookings-table.tsx` (badge)

**Interfaces:**
- Consumes: nothing new — reuses the `profiles.full_name` / `profiles.email` join pattern already established in `lib/conversations-dashboard.ts` `loadConversationDetail()` for `claimedByName`.

- [ ] **Step 1: Join staff names in `page.tsx` and pass them through**

In `app/dashboard/bookings/page.tsx`, insert this block right after the existing `bookingIds`/`reminderByBooking` block and **before** the existing `const rows = (bookings ?? []).map(...)` line — `staffNameById` must be in scope by the time that map runs:

```ts
  const staffIds = [
    ...new Set(
      (bookings ?? [])
        .map((b) => (b as { created_by_staff_id?: string | null }).created_by_staff_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const staffNameById = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", staffIds);
    for (const p of staffProfiles ?? []) {
      staffNameById.set(p.id, p.full_name || p.email || "Team");
    }
  }
```

Add `created_by_staff_id` to the `bookings` select list (currently `"id, guest_name, guest_phone, guest_email, start_time, status, list_status, cancelled_by, guest_timezone, service, cal_booking_uid, session_id, synced_at, raw"` from Task 6's Step 1) — append `, created_by_staff_id`.

Change the `rows` map (currently `bookings.map((b) => ({ ...b, reminder_status: ... }))`) to also attach the name:

```ts
  const rows = (bookings ?? []).map((b) => ({
    ...b,
    reminder_status: reminderByBooking.get(b.id) ?? null,
    created_by_staff_name: b.created_by_staff_id
      ? (staffNameById.get(b.created_by_staff_id) ?? null)
      : null,
  }));
```

- [ ] **Step 2: Add the field to `BookingRow` and render the badge**

In `components/bookings-table.tsx`, add to the `BookingRow` type (after `raw?: unknown;`):

```ts
  created_by_staff_name?: string | null;
```

In the list row rendering, inside the `<div className="min-w-0 flex-1">` block (currently `bookingTitle`, `participantsLine`, then the `Chat`/`Cal.com` line), add the badge right after `bookingTitle`:

```tsx
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {bookingTitle(row, hostName)}
                          </p>
                          {row.created_by_staff_name ? (
                            <Badge
                              variant="secondary"
                              className="mt-1 rounded-sm text-[10px]"
                            >
                              Booked by {row.created_by_staff_name}
                            </Badge>
                          ) : null}
                          <p className="text-muted-foreground mt-1 truncate text-sm">
                            {participantsLine(row)}
                          </p>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run react-doctor**

Run: `npm run doctor`
Expected: no new errors introduced by these two files.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/bookings/page.tsx components/bookings-table.tsx
git commit -m "feat(bookings): show who created a manual booking"
```

---

### Task 8: Manual end-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Reset the local database**

Run: `npx supabase db reset`
Expected: completes clean, applying every migration including Task 1's.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`
Expected: all tests pass, including the new files from Tasks 1, 2, and 4.

- [ ] **Step 3: Start the dev server and walk through the flow**

Run: `npm run dev` (or use the project's preview tooling)

As a staff user on a workspace with at least one synced meeting type and a configured Cal.com key:

1. Open `/dashboard/bookings`. Confirm the **New booking** button appears next to **Sync Cal.com**.
2. Click it. Pick a meeting type, pick a date, confirm real slots load (or "No open slots this day" if none).
3. Pick a slot, fill in guest name/phone/email, submit. Confirm the dialog closes, a "Booking created" toast appears, and the new row shows in the table with a "Booked by {your name}" badge.
4. Confirm the booking is real: it appears in Cal.com's calendar for that slot.
5. Click **Sync Cal.com**. Confirm the row's "Booked by" badge survives the sync (this is what Task 1's preservation logic exists for).
6. Try submitting with an empty guest name — confirm the dialog shows an inline error and does not close.
7. Pick a meeting type with no Cal.com key configured (or temporarily unset one) — confirm a clean error message, not a raw Cal.com/DB string.

- [ ] **Step 4: Update the knowledge graph**

Run: `graphify update .`
Expected: completes, `graphify-out/` updated.

- [ ] **Step 5: Final full-repo checks**

Run: `npm run typecheck && npm run doctor:full`
Expected: typecheck clean; doctor shows no new findings attributable to this feature's files.

- [ ] **Step 6: Commit the graph update**

```bash
git add graphify-out
git commit -m "chore(graphify): update graph after manual booking creation"
```
