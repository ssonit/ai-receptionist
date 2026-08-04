# Optional guest email for booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace owner make guest email optional at booking time (VN market: name + phone is the norm) via a new `guest_email_required` toggle, while Cal.com's required `attendee.email` is satisfied with a per-booking placeholder, and cancel/reschedule ownership rules are unaffected.

**Architecture:** New `workspaces.guest_email_required` column (default `true`), read through the existing `WorkspaceGuestPolicy` (`lib/agent-booking-auth.ts`). `book_appointment.ts` enforces the policy server-side (never trusts the LLM). `lib/booking-create.ts` centralizes placeholder-email generation so both the AI tool and any future caller get it for free. A new tiny pure module (`lib/guest-email-placeholder.ts`) is shared by server code and client dashboard components to detect/hide placeholder addresses.

**Tech Stack:** Next.js (App Router, server actions), Supabase (Postgres + RLS), Cal.com v2 API, vitest (co-located `*.test.ts` for `lib/`, `tests/agent-tools/*.test.ts` for agent tools), `node:crypto`.

## Global Constraints

- Never return raw provider/DB error strings to the guest or dashboard UI (`.claude/rules/errors.md`).
- New error codes go in `lib/errors/app-codes.ts` (`as const`), copy in `lib/errors/app-messages.ts`, keyed by code.
- Tenant data stays scoped by `workspace_id`; no `using (true)` RLS.
- Route paths always via `lib/routes.ts` constants — not touched by this feature, noted for awareness only.
- After any React/UI file change: `npm run doctor` (react-doctor, `--scope changed`) must pass before the task is done.
- After any code file change: `graphify update .`.
- Run `npx vitest run <file>` for the specific test file after every implementation step; run the full `npm test` at the end of the plan.
- Follow existing patterns exactly — this codebase already has a `WorkspaceGuestPolicy` for per-workspace guest-facing toggles (`guest_cancel_enabled`, `guest_reschedule_enabled`, `guest_change_cutoff_minutes`); the new toggle must follow the identical shape, not invent a new mechanism.

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `supabase/migrations/20260804000002_guest_email_optional.sql` | New `workspaces.guest_email_required` column |
| `lib/guest-email-placeholder.ts` (new) | Pure, dependency-free: generate/detect/display placeholder guest emails. Safe to import from client components. |
| `lib/agent-booking-auth.ts` (modify) | `WorkspaceGuestPolicy` + `getWorkspaceGuestPolicy()` gain `guestEmailRequired` |
| `lib/errors/app-codes.ts`, `lib/errors/app-messages.ts` (modify) | New `BOOKING_EMAIL_REQUIRED` code + copy |
| `lib/booking-create.ts` (modify) | `createWorkspaceBooking()` resolves a placeholder email when the guest didn't provide one |
| `agent/tools/book_appointment.ts` (modify) | `email` input optional; server-side policy gate before booking |
| `lib/booking-reminders.ts` (modify) | Reminder cron skips placeholder-email bookings instead of retry-looping |
| `lib/workspace-settings-types.ts`, `app/dashboard/settings/actions.ts`, `app/dashboard/settings/page.tsx`, `app/_components/workspace-settings-form.tsx` (modify) | Settings toggle: type, save action, read-back, checkbox UI |
| `components/bookings-table.tsx`, `components/leads-table.tsx` (modify) | Never show a raw placeholder address to staff |
| `agent/skills/booking_intake.md`, `agent/skills/booking_change.md` (modify) | Agent prompt copy: always ask for email, explain why; note OTP only helps guests with a real email on file |

---

### Task 1: Migration — `workspaces.guest_email_required`

**Files:**
- Create: `supabase/migrations/20260804000002_guest_email_optional.sql`

**Interfaces:**
- Produces: column `public.workspaces.guest_email_required boolean not null default true`, consumed by Task 3.

- [ ] **Step 1: Write the migration**

```sql
-- Guest email optional per workspace (VN market: name + phone is enough).
-- Source: docs/superpowers/specs/2026-08-04-optional-guest-email-design.md

alter table public.workspaces
  add column if not exists guest_email_required boolean not null default true;

comment on column public.workspaces.guest_email_required is
  'If false, guest_email may be a system-generated placeholder (@no-email.invalid) — booking created via phone/name only';
```

- [ ] **Step 2: Apply locally and verify**

Run: `npx supabase db reset`
Expected: migration applies with no errors; `supabase/seed.sql` still seeds successfully afterward.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260804000002_guest_email_optional.sql
git commit -m "feat(db): add workspaces.guest_email_required column"
```

---

### Task 2: `lib/guest-email-placeholder.ts` — placeholder generation/detection

**Files:**
- Create: `lib/guest-email-placeholder.ts`
- Test: `lib/guest-email-placeholder.test.ts`

**Interfaces:**
- Produces:
  - `NO_EMAIL_PLACEHOLDER_DOMAIN: string` (`"no-email.invalid"`)
  - `generatePlaceholderGuestEmail(): string`
  - `isPlaceholderGuestEmail(email: string | null | undefined): boolean`
  - `displayGuestEmail(email: string | null | undefined): string | null`
  Consumed by Task 5 (`lib/booking-create.ts`), Task 7 (`lib/booking-reminders.ts`), Task 9 (dashboard tables).

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/guest-email-placeholder.test.ts
import { describe, expect, it } from "vitest";
import {
  NO_EMAIL_PLACEHOLDER_DOMAIN,
  generatePlaceholderGuestEmail,
  isPlaceholderGuestEmail,
  displayGuestEmail,
} from "./guest-email-placeholder";

describe("generatePlaceholderGuestEmail", () => {
  it("returns a syntactically valid, unique address on the placeholder domain", () => {
    const a = generatePlaceholderGuestEmail();
    const b = generatePlaceholderGuestEmail();
    expect(a).toMatch(/^guest-[0-9a-f-]{36}@no-email\.invalid$/);
    expect(a).not.toBe(b);
    expect(a.endsWith(`@${NO_EMAIL_PLACEHOLDER_DOMAIN}`)).toBe(true);
  });
});

describe("isPlaceholderGuestEmail", () => {
  it("returns true for a generated placeholder", () => {
    expect(isPlaceholderGuestEmail(generatePlaceholderGuestEmail())).toBe(true);
  });

  it("is case-insensitive on the domain", () => {
    expect(isPlaceholderGuestEmail("guest-abc@NO-EMAIL.INVALID")).toBe(true);
  });

  it("returns false for a real email", () => {
    expect(isPlaceholderGuestEmail("a@example.com")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isPlaceholderGuestEmail(null)).toBe(false);
    expect(isPlaceholderGuestEmail(undefined)).toBe(false);
    expect(isPlaceholderGuestEmail("")).toBe(false);
  });
});

describe("displayGuestEmail", () => {
  it("returns the trimmed email when real", () => {
    expect(displayGuestEmail("  a@example.com  ")).toBe("a@example.com");
  });

  it("returns null for a placeholder", () => {
    expect(displayGuestEmail(generatePlaceholderGuestEmail())).toBeNull();
  });

  it("returns null for null/undefined/empty", () => {
    expect(displayGuestEmail(null)).toBeNull();
    expect(displayGuestEmail(undefined)).toBeNull();
    expect(displayGuestEmail("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/guest-email-placeholder.test.ts`
Expected: FAIL — `Cannot find module './guest-email-placeholder'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/guest-email-placeholder.ts
/**
 * Pure — no server-only imports. Safe to use from "use client" components
 * (dashboard tables) as well as server code (lib/booking-create.ts).
 */
import { randomUUID } from "node:crypto";

export const NO_EMAIL_PLACEHOLDER_DOMAIN = "no-email.invalid";

/**
 * Per-booking placeholder for Cal.com's required attendee.email when the
 * guest declined to give a real one. `.invalid` (RFC 2606) never resolves,
 * so any confirmation email Cal.com sends there just bounces silently.
 */
export function generatePlaceholderGuestEmail(): string {
  return `guest-${randomUUID()}@${NO_EMAIL_PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderGuestEmail(
  email: string | null | undefined,
): boolean {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return false;
  return trimmed.endsWith(`@${NO_EMAIL_PLACEHOLDER_DOMAIN}`);
}

/** For UI: real email (trimmed) or null — never show a placeholder to staff. */
export function displayGuestEmail(
  email: string | null | undefined,
): string | null {
  const trimmed = email?.trim();
  if (!trimmed || isPlaceholderGuestEmail(trimmed)) return null;
  return trimmed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/guest-email-placeholder.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/guest-email-placeholder.ts lib/guest-email-placeholder.test.ts
git commit -m "feat(lib): add guest-email placeholder generation/detection helpers"
```

---

### Task 3: `WorkspaceGuestPolicy` gains `guestEmailRequired`

**Files:**
- Modify: `lib/agent-booking-auth.ts:52-57` (type), `lib/agent-booking-auth.ts:412-435` (`getWorkspaceGuestPolicy`)
- Test: `lib/agent-booking-auth.test.ts` (new)

**Interfaces:**
- Consumes: `createAdminClient` mock from `tests/setup.ts` (global `vi.mock("@/lib/supabase/admin", ...)`).
- Produces: `WorkspaceGuestPolicy.guestEmailRequired: boolean`, `getWorkspaceGuestPolicy(workspaceId): Promise<WorkspaceGuestPolicy>` — consumed by Task 6 (`book_appointment.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/agent-booking-auth.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";
import { getWorkspaceGuestPolicy } from "./agent-booking-auth";

const WS = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  supabaseMock.clear();
});

describe("getWorkspaceGuestPolicy — guestEmailRequired", () => {
  it("defaults to true when the column is null/missing", async () => {
    supabaseMock.seed("workspaces", [{ id: WS }]);
    const policy = await getWorkspaceGuestPolicy(WS);
    expect(policy.guestEmailRequired).toBe(true);
  });

  it("returns false when explicitly disabled", async () => {
    supabaseMock.seed("workspaces", [{ id: WS, guest_email_required: false }]);
    const policy = await getWorkspaceGuestPolicy(WS);
    expect(policy.guestEmailRequired).toBe(false);
  });

  it("returns true when explicitly enabled", async () => {
    supabaseMock.seed("workspaces", [{ id: WS, guest_email_required: true }]);
    const policy = await getWorkspaceGuestPolicy(WS);
    expect(policy.guestEmailRequired).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agent-booking-auth.test.ts`
Expected: FAIL — `policy.guestEmailRequired` is `undefined`, not `true`/`false`.

- [ ] **Step 3: Implement**

Modify `lib/agent-booking-auth.ts:52-57`:

```typescript
export type WorkspaceGuestPolicy = {
  guestCancelEnabled: boolean;
  guestRescheduleEnabled: boolean;
  guestChangeCutoffMinutes: number;
  guestEmailRequired: boolean;
  isPilot: boolean;
};
```

Modify `lib/agent-booking-auth.ts:412-435`:

```typescript
export async function getWorkspaceGuestPolicy(
  workspaceId: string,
): Promise<WorkspaceGuestPolicy> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select(
      "guest_cancel_enabled, guest_reschedule_enabled, guest_change_cutoff_minutes, guest_email_required",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  return {
    guestCancelEnabled: data?.guest_cancel_enabled !== false,
    guestRescheduleEnabled: data?.guest_reschedule_enabled !== false,
    guestChangeCutoffMinutes:
      typeof data?.guest_change_cutoff_minutes === "number"
        ? data.guest_change_cutoff_minutes
        : 120,
    guestEmailRequired: data?.guest_email_required !== false,
    // Compare against the canonical Pilot id (env-overridable), not a
    // user-editable slug — workspaces.slug can be renamed from Settings.
    isPilot: workspaceId === getPilotWorkspaceId(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agent-booking-auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update existing mocks that assert the full `WorkspaceGuestPolicy` shape**

`tests/agent-tools/cancel_appointment.test.ts` and `tests/agent-tools/reschedule_appointment.test.ts` each mock `getWorkspaceGuestPolicy` to resolve `{ guestCancelEnabled, guestRescheduleEnabled, guestChangeCutoffMinutes, isPilot }` (4 occurrences total across the two files). Add `guestEmailRequired: true` to every one of those mock objects so the shape matches the real type (TypeScript will otherwise flag these as excess-property-safe but the value should still be explicit for anyone reading the test).

Example, `tests/agent-tools/cancel_appointment.test.ts:90-95` (repeat for the other 3 occurrences):

```typescript
vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
  guestCancelEnabled: true,
  guestRescheduleEnabled: true,
  guestChangeCutoffMinutes: 120,
  guestEmailRequired: true,
  isPilot: false,
});
```

- [ ] **Step 6: Run the full existing suites for both files to confirm no regression**

Run: `npx vitest run tests/agent-tools/cancel_appointment.test.ts tests/agent-tools/reschedule_appointment.test.ts`
Expected: PASS (all existing tests, unchanged behavior)

- [ ] **Step 7: Commit**

```bash
git add lib/agent-booking-auth.ts lib/agent-booking-auth.test.ts tests/agent-tools/cancel_appointment.test.ts tests/agent-tools/reschedule_appointment.test.ts
git commit -m "feat(lib): add guestEmailRequired to WorkspaceGuestPolicy"
```

---

### Task 4: New error code `BOOKING_EMAIL_REQUIRED`

**Files:**
- Modify: `lib/errors/app-codes.ts:66` (insert after `BOOKING_EMAIL_UNAVAILABLE`)
- Modify: `lib/errors/app-messages.ts:100-101` (insert matching message)

**Interfaces:**
- Produces: `APP_ERROR_CODE.BOOKING_EMAIL_REQUIRED` — consumed by Task 6.

- [ ] **Step 1: Add the code**

Modify `lib/errors/app-codes.ts`, right after line 66 (`BOOKING_EMAIL_UNAVAILABLE: "booking_email_unavailable",`):

```typescript
  BOOKING_EMAIL_REQUIRED: "booking_email_required",
```

- [ ] **Step 2: Add the message**

Modify `lib/errors/app-messages.ts`, right after the `BOOKING_EMAIL_UNAVAILABLE` entry (lines 100-101):

```typescript
  [APP_ERROR_CODE.BOOKING_EMAIL_REQUIRED]:
    "This business requires an email to book. Ask the guest for one and try again.",
```

- [ ] **Step 3: Verify it compiles and existing error tests still pass**

Run: `npm run typecheck`
Expected: no new errors.

Run: `npx vitest run lib/errors`
Expected: PASS (no existing test targets `lib/errors` specifically — if this glob matches nothing, that's fine; move on).

- [ ] **Step 4: Commit**

```bash
git add lib/errors/app-codes.ts lib/errors/app-messages.ts
git commit -m "feat(errors): add BOOKING_EMAIL_REQUIRED code"
```

---

### Task 5: `lib/booking-create.ts` — placeholder fallback

**Files:**
- Modify: `lib/booking-create.ts:24-44` (`CreateWorkspaceBookingInput`), `lib/booking-create.ts:61-101` (`buildBookingRow`, `createWorkspaceBooking`)
- Test: `lib/booking-create.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `generatePlaceholderGuestEmail()` from Task 2 (`lib/guest-email-placeholder.ts`).
- Produces: `CreateWorkspaceBookingInput.email` is now `string | null | undefined` (was `string`) — consumed by Task 6 (`book_appointment.ts`).

- [ ] **Step 1: Write the failing test**

Add to `lib/booking-create.test.ts` (after the existing 3 `it` blocks, inside the same `describe`):

```typescript
  it("uses a placeholder email when the guest didn't provide one, and Cal.com/leads/bookings all see it", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_no_email",
      start: SLOT,
      status: "confirmed",
      meetingUrl: undefined,
      raw: {},
    });
    const leadsMod = await import("@/lib/leads");

    const { createWorkspaceBooking } = await import("./booking-create");
    const { isPlaceholderGuestEmail } = await import(
      "./guest-email-placeholder"
    );
    const result = await createWorkspaceBooking(
      baseInput({ email: undefined }),
    );

    expect(result.ok).toBe(true);

    // Cal.com got a syntactically valid placeholder, not an empty string.
    expect(calcom.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        attendeeEmail: expect.stringMatching(/^guest-.+@no-email\.invalid$/),
      }),
    );

    // bookings row and lead upsert both got the same placeholder.
    const inserts = supabaseMock.insertsFor("bookings");
    expect(isPlaceholderGuestEmail(inserts[0]!.guest_email as string)).toBe(
      true,
    );
    expect(leadsMod.upsertLeadAsBooked).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.stringMatching(/^guest-.+@no-email\.invalid$/),
      }),
    );
  });

  it("uses the real email unchanged when the guest provided one", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_real_email",
      start: SLOT,
      status: "confirmed",
      meetingUrl: undefined,
      raw: {},
    });

    const { createWorkspaceBooking } = await import("./booking-create");
    await createWorkspaceBooking(baseInput({ email: "a@example.com" }));

    expect(calcom.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeEmail: "a@example.com" }),
    );
    const inserts = supabaseMock.insertsFor("bookings");
    expect(inserts[0]).toMatchObject({ guest_email: "a@example.com" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/booking-create.test.ts`
Expected: FAIL — Cal.com receives `attendeeEmail: undefined`, not a placeholder; `Cannot find module './guest-email-placeholder'` is not the failure since Task 2 already created it, but the assertion on the placeholder pattern fails.

- [ ] **Step 3: Implement**

Modify `lib/booking-create.ts:1-44` — add the import and widen the type:

```typescript
import { createBooking, type CreateBookingResult } from "@/lib/calcom";
import { generatePlaceholderGuestEmail } from "@/lib/guest-email-placeholder";
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
  /** Omitted/empty when the workspace allows booking without email — a placeholder is generated. */
  email?: string | null;
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
```

Modify `buildBookingRow` (`lib/booking-create.ts:61-86`) to take the resolved email explicitly instead of reading `input.email`:

```typescript
function buildBookingRow(
  input: CreateWorkspaceBookingInput,
  booking: CreateBookingResult,
  manageCodeHash: string,
  email: string,
) {
  return {
    workspace_id: input.workspaceId,
    cal_booking_uid: booking.uid,
    guest_name: input.guestName,
    guest_phone: input.phone,
    guest_email: email,
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
```

Modify `createWorkspaceBooking` (`lib/booking-create.ts:88-101`, first ~14 lines) to resolve `email` once and use it everywhere:

```typescript
export async function createWorkspaceBooking(
  input: CreateWorkspaceBookingInput,
): Promise<CreateWorkspaceBookingResult> {
  const email = input.email?.trim() || generatePlaceholderGuestEmail();

  const booking = await createBooking({
    start: input.start,
    attendeeName: input.guestName,
    attendeeEmail: email,
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
  const row = buildBookingRow(input, booking, manageCodeHash, email);
```

Then further down in the same function, change the `upsertLeadAsBooked` call's `email: input.email` to `email` (the resolved local variable):

```typescript
    await upsertLeadAsBooked({
      workspaceId: input.workspaceId,
      fullName: input.guestName,
      phone: input.phone,
      email,
      service: input.service ?? input.eventTitle ?? null,
      notes: input.notes ?? null,
      sessionId: input.sessionId,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/booking-create.test.ts`
Expected: PASS (5 tests: 3 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add lib/booking-create.ts lib/booking-create.test.ts
git commit -m "feat(booking): fall back to a placeholder email when the guest gave none"
```

---

### Task 6: `agent/tools/book_appointment.ts` — optional email + server-side policy gate

**Files:**
- Modify: `agent/tools/book_appointment.ts:1-16` (imports), `:21-32` (schema), `:33-57` (execute, early gate)
- Test: `tests/agent-tools/book_appointment.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `getWorkspaceGuestPolicy` (Task 3), `APP_ERROR_CODE.BOOKING_EMAIL_REQUIRED` (Task 4), `createWorkspaceBooking` with optional `email` (Task 5).
- Produces: `book_appointment` tool accepts `email?: string`; returns `{ ok: false, error }` (via `appErrorMessage(BOOKING_EMAIL_REQUIRED)`) when the workspace requires email and none was given.

- [ ] **Step 1: Write the failing tests**

Add to `tests/agent-tools/book_appointment.test.ts`, inside the top-level `describe("book_appointment tool", ...)`, after the existing tests. First extend the `agent-booking-auth` mock at the top of the file (line 25-27) to also mock `getWorkspaceGuestPolicy`:

```typescript
// agent-booking-auth mock — avoid cascading DB queries
vi.mock("@/lib/agent-booking-auth", () => ({
  resolveGuestBookingActor: vi.fn(),
  getWorkspaceGuestPolicy: vi.fn(),
}));
```

Then add the new tests:

```typescript
  it("books successfully without email when the workspace does not require it", async () => {
    seedPilotWithAiEventType({ guest_email_required: false });

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([{ start: SLOT }]);
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_no_email",
      start: SLOT,
      status: "confirmed",
      meetingUrl: undefined,
      raw: {},
    });

    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-no-email",
        visitorId: "vis-no-email",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });
    vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
      guestCancelEnabled: true,
      guestRescheduleEnabled: true,
      guestChangeCutoffMinutes: 120,
      guestEmailRequired: false,
      isPilot: false,
    });

    const tzMod = await import("@/lib/guest-timezone-resolve");
    vi.mocked(tzMod.resolveGuestTimeZone).mockResolvedValue({
      guestTimeZone: "Asia/Ho_Chi_Minh",
      source: "session",
    });

    const tool = (await import("../../agent/tools/book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Nguyen Van C",
        phone: "+84900000000",
        start: SLOT,
      },
      {
        session: {
          id: "test-session-no-email",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    const bookingInserts = supabaseMock.insertsFor("bookings");
    expect(bookingInserts[0]!.guest_email).toMatch(/^guest-.+@no-email\.invalid$/);
  });

  it("returns {ok:false} when the workspace requires email and none was given", async () => {
    seedPilotWithAiEventType({ guest_email_required: true });

    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-required",
        visitorId: "vis-required",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });
    vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
      guestCancelEnabled: true,
      guestRescheduleEnabled: true,
      guestChangeCutoffMinutes: 120,
      guestEmailRequired: true,
      isPilot: false,
    });

    const tool = (await import("../../agent/tools/book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Nguyen Van D",
        phone: "+84900000001",
        start: SLOT,
      },
      {
        session: {
          id: "test-session-required",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("requires an email");
    }
    // Never reached Cal.com — the gate is before availability re-check.
    const calcom = await import("@/lib/calcom");
    expect(calcom.createBooking).not.toHaveBeenCalled();
  });
```

Update `seedPilotWithAiEventType` (`tests/agent-tools/book_appointment.test.ts:52-79`) so tests can override `guest_email_required` via the existing `overrides` param — it already spreads `...overrides` into the seeded `workspaces` row, so **no change needed there**; passing `{ guest_email_required: false }` as shown above already works with the existing helper signature.

Also update the 4 existing happy-path/error tests that call `resolveGuestBookingActor` — they must now also mock `getWorkspaceGuestPolicy` to resolve (defaulting to required, matching production default), otherwise the new gate runs against an `undefined` mock and throws. Add this line right after each existing `vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({...})` block (3 occurrences: "creates booking and returns manageCode", "returns {ok:true, warning} when DB mirror fails"):

```typescript
    vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
      guestCancelEnabled: true,
      guestRescheduleEnabled: true,
      guestChangeCutoffMinutes: 120,
      guestEmailRequired: true,
      isPilot: false,
    });
```

(The two tests that fail before reaching `resolveGuestBookingActor` — "no AI event type configured" and "Cal key is missing" — never call `getWorkspaceGuestPolicy` today because the gate in Task 6's implementation is placed *before* the `aiEvent`/`apiKey` checks — see Step 3. Re-check after implementing: if the gate moves earlier than those checks, those two tests will also need a `getWorkspaceGuestPolicy` mock. Implement Step 3 exactly as written below — the gate goes in, in order: resolve workspaceId → policy gate → aiEvent check → apiKey check — so those two tests DO need the mock too. Add the same `getWorkspaceGuestPolicy` mock block to the "no AI event type configured" and "Cal key is missing" tests as well, right before their `tool.execute(...)` call.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent-tools/book_appointment.test.ts`
Expected: FAIL — new tests fail (`email` still required by zod, no policy gate exists yet); some previously-passing tests may now throw on the unmocked `getWorkspaceGuestPolicy` call once Step 3 lands, which is why Step 1 already added the mocks preemptively — right after this run, every failure should be about missing gate behavior, not missing mocks.

- [ ] **Step 3: Implement**

Modify `agent/tools/book_appointment.ts:1-16` — add the import:

```typescript
import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveGuestBookingActor, getWorkspaceGuestPolicy } from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { createWorkspaceBooking } from "@/lib/booking-create";
import { getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { calendarDayInTimeZone } from "@/lib/guest-timezone";
import { resolveGuestTimeZone } from "@/lib/guest-timezone-resolve";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
  resolveWorkspaceIdFromAgentContext,
} from "@/lib/workspace";
import { getAiBookingEventType } from "@/lib/workspace-cal";
```

Modify the schema (`agent/tools/book_appointment.ts:18-32`):

```typescript
export default defineTool({
  description:
    "Create a real appointment booking in the calendar after the guest confirmed a specific available slot. Requires name, phone, and an ISO start time that came from check_availability. Email is usually optional (ask for it — it enables self-service cancel/reschedule later — but only insist if this tool returns BOOKING_EMAIL_REQUIRED for this workspace).",
  inputSchema: z.object({
    guestName: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email().optional(),
    start: z.string().describe("ISO 8601 start time from check_availability"),
    service: z
      .string()
      .optional()
      .describe("Requested service or reason for visit"),
    notes: z.string().optional(),
    sessionId: z.string().optional(),
  }),
```

Modify `execute()` — insert the policy gate right after `workspaceIdForLog = workspaceId;` and before the `aiEvent` lookup (`agent/tools/book_appointment.ts:40-57`):

```typescript
      const workspaceId = await resolveWorkspaceIdFromAgentContext({
        sessionId: sid,
        auth: ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null,
      });
      workspaceIdForLog = workspaceId;

      const policy = await getWorkspaceGuestPolicy(workspaceId);
      if (policy.guestEmailRequired && !email?.trim()) {
        const error = appErrorMessage(APP_ERROR_CODE.BOOKING_EMAIL_REQUIRED);
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error,
          sessionId: sid,
          workspaceId,
        });
        return { ok: false as const, error };
      }

      const aiEvent = await getAiBookingEventType(workspaceId);
```

(The rest of `execute()` is unchanged — the final `createWorkspaceBooking({ ..., email, ... })` call already passes the `email` destructured param, which is now `string | undefined`, matching Task 5's widened `CreateWorkspaceBookingInput.email?: string | null`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent-tools/book_appointment.test.ts`
Expected: PASS (all 7 tests: 5 existing + 2 new)

- [ ] **Step 5: Run the full test suite to catch any other regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add agent/tools/book_appointment.ts tests/agent-tools/book_appointment.test.ts
git commit -m "feat(agent): make book_appointment email optional, gated by workspace policy"
```

---

### Task 7: `lib/booking-reminders.ts` — skip placeholder-email bookings

**Files:**
- Modify: `lib/booking-reminders.ts:1-19` (imports), `:580-585` (`sendOneReminder` email resolution)
- Test: `lib/booking-reminders.test.ts` (new)

**Interfaces:**
- Consumes: `isPlaceholderGuestEmail` from Task 2.
- Produces: `resolveReminderEmail(destination: string | null, guestEmail: string | null): string | null` — new exported pure helper, used by `sendOneReminder` internally. Not consumed elsewhere in this plan; exported solely so it's unit-testable without mocking the full reminder pipeline (`sendOneReminder` itself is not exported and has heavy DB/email dependencies out of scope for this feature).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/booking-reminders.test.ts
import { describe, expect, it } from "vitest";
import { resolveReminderEmail } from "./booking-reminders";
import { generatePlaceholderGuestEmail } from "./guest-email-placeholder";

describe("resolveReminderEmail", () => {
  it("prefers the explicit destination over the booking's guest_email", () => {
    expect(resolveReminderEmail("a@example.com", "b@example.com")).toBe(
      "a@example.com",
    );
  });

  it("falls back to guest_email when destination is null", () => {
    expect(resolveReminderEmail(null, "b@example.com")).toBe(
      "b@example.com",
    );
  });

  it("returns null when both are empty", () => {
    expect(resolveReminderEmail(null, null)).toBeNull();
    expect(resolveReminderEmail("", "")).toBeNull();
  });

  it("returns null for a placeholder guest_email", () => {
    expect(resolveReminderEmail(null, generatePlaceholderGuestEmail())).toBeNull();
  });

  it("returns null for a placeholder destination", () => {
    expect(
      resolveReminderEmail(generatePlaceholderGuestEmail(), "b@example.com"),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/booking-reminders.test.ts`
Expected: FAIL — `resolveReminderEmail` is not exported (does not exist yet).

- [ ] **Step 3: Implement**

Modify `lib/booking-reminders.ts:1-19` — add the import:

```typescript
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/app-origin";
import { isCancelledStatus } from "@/lib/booking-status";
import { hashManageLinkToken } from "@/lib/booking-manage-code";
import {
  bookingReminderEmailCopy,
  sendTransactionalEmail,
} from "@/lib/email";
import { isPlaceholderGuestEmail } from "@/lib/guest-email-placeholder";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { createNotificationDebounced } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalizeTimezone } from "@/lib/timezones";
import { isWorkspaceBookingLive, publicBookingPath } from "@/lib/workspace";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";
```

Add the new exported helper (place it right above `sendOneReminder`, i.e. just before line 515):

```typescript
/**
 * Real destination email for a reminder, or null if there isn't one worth
 * sending to (empty, or a system-generated no-reply placeholder from a
 * guest who declined to give an email at booking time).
 */
export function resolveReminderEmail(
  destination: string | null,
  guestEmail: string | null,
): string | null {
  const email = destination?.trim() || guestEmail?.trim() || "";
  if (!email || isPlaceholderGuestEmail(email)) return null;
  return email;
}
```

Modify `sendOneReminder` (`lib/booking-reminders.ts:580-585`):

```typescript
  const email = resolveReminderEmail(row.destination, booking.guest_email);
  if (!email) {
    await mark("skipped", "no_email");
    return "skipped";
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/booking-reminders.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/booking-reminders.ts lib/booking-reminders.test.ts
git commit -m "fix(reminders): skip placeholder-email bookings instead of retrying"
```

---

### Task 8: Settings UI — `guestEmailRequired` toggle

**Files:**
- Modify: `lib/workspace-settings-types.ts:27-29` (`WorkspaceOpsValues`)
- Modify: `app/dashboard/settings/actions.ts:108-110` (`saveWorkspaceSettings`)
- Modify: `app/dashboard/settings/page.tsx:50` (select list), `:97-98` (mapping to `WorkspaceOpsValues`)
- Modify: `app/_components/workspace-settings-form.tsx:553-562` (checkbox)

**Interfaces:**
- Produces: owners can toggle `workspaces.guest_email_required` from `/dashboard/settings`; this is what Task 6's `getWorkspaceGuestPolicy()` reads at booking time.

- [ ] **Step 1: Add the field to the shared type**

Modify `lib/workspace-settings-types.ts:27-29`:

```typescript
  guestCancelEnabled?: boolean;
  guestRescheduleEnabled?: boolean;
  guestChangeCutoffMinutes?: number;
  guestEmailRequired?: boolean;
```

- [ ] **Step 2: Write it on save**

Modify `app/dashboard/settings/actions.ts`, in the `.update({ ... })` call, right after line 109 (`guest_reschedule_enabled: ...`):

```typescript
      guest_cancel_enabled: formData.get("guestCancelEnabled") === "on",
      guest_reschedule_enabled: formData.get("guestRescheduleEnabled") === "on",
      guest_email_required: formData.get("guestEmailRequired") === "on",
      guest_change_cutoff_minutes: guestChangeCutoffMinutes,
```

- [ ] **Step 3: Read it back for the form**

Modify `app/dashboard/settings/page.tsx:50` — add `guest_email_required` to the select list:

```typescript
        "name, slug, timezone, phone, address, email, website, tagline, guest_cancel_enabled, guest_reschedule_enabled, guest_change_cutoff_minutes, guest_email_required, service_mode, booking_reminders_enabled, reminder_lead_minutes, reminder_quiet_start, reminder_quiet_end, cal_auth_mode, cal_username, webhook_secret_encrypted, plan_tier, subscription_status, trial_ends_at",
```

Modify `app/dashboard/settings/page.tsx:97-98` — add the mapped field, right after `guestRescheduleEnabled`:

```typescript
        guestCancelEnabled: data.guest_cancel_enabled !== false,
        guestRescheduleEnabled: data.guest_reschedule_enabled !== false,
        guestEmailRequired: data.guest_email_required !== false,
```

- [ ] **Step 4: Add the checkbox**

Modify `app/_components/workspace-settings-form.tsx`, right after the "Allow guest reschedule" `<label>` block (after line 562, before the `guest-cutoff` `<div>` at line 563):

```tsx
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      defaultChecked={workspace?.guestEmailRequired !== false}
                      name="guestEmailRequired"
                      type="checkbox"
                    />
                    Require guest email
                  </label>
```

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: react-doctor on the changed UI file**

Run: `npm run doctor`
Expected: no new errors/score drop on `app/_components/workspace-settings-form.tsx`.

- [ ] **Step 7: Manual verification (no automated test coverage exists for dashboard server actions/forms in this repo — matches existing pattern)**

Start the dev server (`npm run dev`), sign in as a workspace owner, open `/dashboard/settings`, confirm:
- "Require guest email" appears checked by default for an existing workspace.
- Unchecking it and saving persists (reload the page — it stays unchecked).
- Re-checking and saving persists.

- [ ] **Step 8: Commit**

```bash
git add lib/workspace-settings-types.ts app/dashboard/settings/actions.ts app/dashboard/settings/page.tsx app/_components/workspace-settings-form.tsx
git commit -m "feat(settings): add Require guest email toggle"
```

---

### Task 9: Dashboard — never show a raw placeholder email to staff

**Files:**
- Modify: `components/bookings-table.tsx:1-11` (import), `:184-188` (`participantsLine`), `:397-408` (copy-email menu item #1), `:660-676` (detail panel), `:746-758` (copy-email menu item #2)
- Modify: `components/leads-table.tsx:1-25` (import), `:172-173` (`DetailRow` email), `:461-469` (copy-email menu item)

**Interfaces:**
- Consumes: `displayGuestEmail` from Task 2 (`lib/guest-email-placeholder.ts`).

- [ ] **Step 1: `bookings-table.tsx` — add the import**

Modify `components/bookings-table.tsx`, add to the existing `@/lib/*` import group (near line 19-21):

```typescript
import {
  CAL_BOOKING_VIEWS,
  getCalBookingView,
  getCalLifecycleBadgeLabel,
  type CalBookingListFilter,
  type CalBookingView,
} from "@/lib/booking-status";
import { displayGuestEmail } from "@/lib/guest-email-placeholder";
import { cn } from "@/lib/utils";
import { openAfterMenuClose } from "@/lib/open-after-menu-close";
```

- [ ] **Step 2: `participantsLine` (`components/bookings-table.tsx:184-188`)**

```typescript
function participantsLine(row: BookingRow) {
  const parts = ["You", row.guest_name];
  const email = displayGuestEmail(row.guest_email);
  if (email) parts.push(email);
  return parts.join(" · ");
}
```

- [ ] **Step 3: "Copy email" menu item #1 (`components/bookings-table.tsx:397-408`)**

```typescript
                              <DropdownMenuItem
                                onSelect={() => {
                                  const email = displayGuestEmail(row.guest_email);
                                  if (!email) {
                                    toast.error("No email");
                                    return;
                                  }
                                  void navigator.clipboard.writeText(email);
                                  toast.success("Email copied");
                                }}
                              >
                                Copy email
                              </DropdownMenuItem>
```

- [ ] **Step 4: Detail panel (`components/bookings-table.tsx:660-676`)**

```tsx
              <div className="flex items-start gap-3">
                <div className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                  {initialOf(booking.guest_name)}
                </div>
                <div className="min-w-0 space-y-0.5 pt-0.5">
                  <p className="text-sm font-medium">{booking.guest_name}</p>
                  {displayGuestEmail(booking.guest_email) ? (
                    <p className="text-muted-foreground truncate text-sm">
                      {displayGuestEmail(booking.guest_email)}
                    </p>
                  ) : null}
                  {booking.guest_phone ? (
                    <p className="text-muted-foreground text-sm">
                      {booking.guest_phone}
                    </p>
                  ) : null}
                </div>
              </div>
```

- [ ] **Step 5: "Copy email" menu item #2 (`components/bookings-table.tsx:746-758`)**

```typescript
            <DropdownMenuItem
              onSelect={() => {
                const email = displayGuestEmail(booking.guest_email);
                if (!email) {
                  toast.error("No email");
                  return;
                }
                void navigator.clipboard.writeText(email);
                toast.success("Email copied");
              }}
            >
              Copy email
            </DropdownMenuItem>
```

- [ ] **Step 6: `leads-table.tsx` — add the import**

Modify `components/leads-table.tsx`, add to the existing import block (near line 15-16):

```typescript
import {
  updateLeadNotesAction,
  updateLeadStatusAction,
} from "@/app/dashboard/leads/actions";
import { displayGuestEmail } from "@/lib/guest-email-placeholder";
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 7: `DetailRow` email (`components/leads-table.tsx:172-173`)**

```tsx
            <DetailRow label="Phone" value={lead.phone} />
            <DetailRow label="Email" value={displayGuestEmail(lead.email)} />
```

(`DetailRow` already renders `value || "—"` — passing `null` from `displayGuestEmail` gives the same "—" fallback already used for every other empty field. No new copy needed.)

- [ ] **Step 8: "Copy email" menu item (`components/leads-table.tsx:461-469`)**

```typescript
                            <DropdownMenuItem
                              onSelect={() => {
                                const email = displayGuestEmail(row.email);
                                if (!email) {
                                  toast.error("No email");
                                  return;
                                }
                                void navigator.clipboard.writeText(email);
                                toast.success("Email copied");
```

- [ ] **Step 9: Verify types compile**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 10: react-doctor on the changed files**

Run: `npm run doctor`
Expected: no new errors/score drop on `components/bookings-table.tsx`, `components/leads-table.tsx`.

- [ ] **Step 11: Manual verification**

Start the dev server, open `/dashboard/bookings` and `/dashboard/leads`. Create one booking via `/b/<slug>` (or the AI chat) with the new "Require guest email" toggle off and no email given. Confirm:
- The bookings list row and detail panel show no email line (not the raw placeholder).
- "Copy email" shows the "No email" toast instead of copying garbage.
- The leads detail sheet shows "—" for Email, not the placeholder.

- [ ] **Step 12: Commit**

```bash
git add components/bookings-table.tsx components/leads-table.tsx
git commit -m "fix(dashboard): never show a raw placeholder guest email to staff"
```

---

### Task 10: Agent prompt copy

**Files:**
- Modify: `agent/skills/booking_intake.md:10,16`
- Modify: `agent/skills/booking_change.md:9`

**Interfaces:** None (markdown prompt fragments, no code).

- [ ] **Step 1: Update `booking_intake.md`**

Modify line 10 (question list, item 4):

```markdown
4. Full name and phone always. Email too if they're willing — it lets them self-serve cancel/reschedule later from another device.
```

Modify line 16:

```markdown
- Collect full name and phone before `book_appointment`; ask for email as well, but only insist on it if the tool returns an error saying this business requires it (`guestName`).
```

- [ ] **Step 2: Update `booking_change.md`**

Modify line 9, appending a clause:

```markdown
3. Email OTP → `request_booking_otp` then `verify_booking_code` (`email_otp`). Never reveal whether the email has a booking. Only works for guests who gave a real email at booking time.
```

- [ ] **Step 3: Commit**

```bash
git add agent/skills/booking_intake.md agent/skills/booking_change.md
git commit -m "docs(agent): clarify optional-email booking intake and OTP limits"
```

---

### Task 11: Full verification pass

**Files:** None (verification only).

- [ ] **Step 1: Full automated test suite**

Run: `npm test`
Expected: PASS, no regressions across the whole suite.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Full react-doctor scan**

Run: `npm run doctor:full`
Expected: no new errors introduced by this feature's files.

- [ ] **Step 4: graphify update**

Run: `graphify update .`
Expected: completes without error; new files (`lib/guest-email-placeholder.ts`, its test, `lib/agent-booking-auth.test.ts`, `lib/booking-reminders.test.ts`) are now in the graph.

- [ ] **Step 5: Manual acceptance walkthrough against the spec's testing section**

Using the running dev server (`npm run dev`) and a **real or sandbox Cal.com account** (per the design spec's flagged assumption — this is the one thing that cannot be verified by mocks):

1. New workspace, `guest_email_required` defaults `true` → book without email via chat is rejected with a clear reason; booking with email succeeds (regression check).
2. Owner unchecks "Require guest email" in Settings → guest books with only name + phone via chat → confirm in the Cal.com dashboard that the booking was created (with the placeholder attendee email) — this is the one assumption from the spec that only a live Cal.com call can confirm.
3. Dashboard bookings list, detail panel, and leads table show no email / "—" for that booking, never the raw placeholder.
4. Same chat session → cancel the booking → succeeds (A1, no email involved).
5. Book again without email, then simulate "different session" (clear cookies or use a private window) with no manage code saved → try to cancel/reschedule via chat → agent should end up recommending contacting staff (`request_booking_change`), not claim success.
6. Confirm (via logs or a manual cron trigger if available locally) that a reminder scheduled for a placeholder-email booking is marked `skipped` / `no_email`, not `failed`.
7. A workspace with `guest_email_required = true` (the default, untouched) behaves identically to before this feature end-to-end.

- [ ] **Step 6: Final commit if any fixes were needed during manual verification**

If Step 5 surfaces anything, fix it, re-run the relevant automated test(s) from the task that owns that file, then:

```bash
git add -A
git commit -m "fix: address issues found in optional-guest-email manual verification"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** every "Module map" row in `docs/superpowers/specs/2026-08-04-optional-guest-email-design.md` maps to a task above. Two additions beyond the spec, found while reading real code: `app/dashboard/settings/page.tsx` (select + mapping) was missing from the spec's module map — added to Task 8. The spec assumed `messages/en.json`/`messages/vi.json` copy would be needed for the Settings checkbox and dashboard "no email" label; reading the actual code showed neither is true (the settings form's sibling checkboxes are hardcoded English, not i18n-wired, and `DetailRow`/conditional-render already fall back to "—"/nothing for empty values) — Tasks 8 and 9 follow the real existing pattern instead.
- **Placeholder scan:** no TBD/TODO in any task; every step has runnable code or an exact command.
- **Type consistency:** `CreateWorkspaceBookingInput.email` (Task 5) is `string | null | undefined`, matching what `book_appointment.ts`'s optional zod `email` (Task 6) produces (`string | undefined`) and what `createWorkspaceBooking` accepts. `WorkspaceGuestPolicy.guestEmailRequired` (Task 3) is read the same way in Task 6 (`policy.guestEmailRequired`). `isPlaceholderGuestEmail` / `displayGuestEmail` / `generatePlaceholderGuestEmail` (Task 2) are used with identical names and signatures in Tasks 5, 7, and 9 — no renames across tasks.
