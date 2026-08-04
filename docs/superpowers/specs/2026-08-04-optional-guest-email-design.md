# Optional guest email for booking

**Date:** 2026-08-04
**Status:** Design approved in conversation — ready for implementation plan
**Scope:** Let workspaces make guest email optional at `book_appointment` time (VN market: name + phone is the norm); keep Cal.com's required `attendee.email` satisfied via a per-booking placeholder; keep cancel/reschedule ownership rules unchanged.

## Goal

Today `book_appointment` hard-requires `guestName`, `phone`, `email`. In practice, foreign/EN-locale workspaces are fine with all three, but VN workspaces typically only want name + phone from the guest. Make email optional **per workspace** (owner-controlled toggle, default on) without weakening guest booking-ownership security or silently breaking Cal.com's booking API contract.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope of "optional" | Per-workspace boolean toggle (`guest_email_required`, default `true`) — not locale-inferred, not a hardcoded VN/EN split |
| Pattern to follow | Reuse existing `WorkspaceGuestPolicy` (`lib/agent-booking-auth.ts`) — same shape as `guest_cancel_enabled` / `guest_reschedule_enabled` / `guest_change_cutoff_minutes` |
| Cal.com payload | Unchanged — `attendee.email` still sent on every booking. When the guest has no real email, send a per-booking random placeholder (`guest-<uuid>@no-email.invalid`) instead of leaving it out |
| Enforcement | Server-side in `book_appointment.ts`, not prompt-only — the tool re-checks the workspace policy itself, never trusts the LLM to have asked |
| Agent behavior | Agent still **asks** for email every time (helps guest self-serve cancel/reschedule later); only *blocks* booking on missing email when the resolved workspace policy requires it |
| Cancel/reschedule | No change to claim-tier logic (A1 session, A2 visitor+phone, A+ profile, B manage code, C email OTP). Guests without a real email keep A1/A2/B; OTP (C) naturally never matches a placeholder they don't know; final fallback is the existing `request_booking_change` (staff) tool |
| Dashboard display | Any UI reading `guest_email` must detect the placeholder and show "No email provided" instead of the raw fake address |
| Staff manual booking | Out of scope — dashboard manual-booking form UI/validation untouched |

## Current state

- `agent/tools/book_appointment.ts`: `email: z.string().email()` required; passed straight through to `createWorkspaceBooking`.
- `lib/booking-create.ts` `createWorkspaceBooking()`: single chokepoint used by both the AI agent tool and the dashboard's manual-booking action; calls `lib/calcom.ts` `createBooking()`, which always sends `attendee.email` in the Cal.com v2 payload (unlike `attendeePhone`, which is conditionally included).
- `lib/leads.ts` `upsertLeadAsBooked()` / `findWorkspaceLead()` dedupe leads by `session_id` and `phone` only — **email is not a dedupe key**, confirmed by reading the function. Placeholder emails cannot cause lead merge bugs.
- `lib/agent-booking-auth.ts` already has a per-workspace guest policy (`WorkspaceGuestPolicy` / `getWorkspaceGuestPolicy()`) gating cancel/reschedule behavior — the natural home for a new `guestEmailRequired` flag.
- `agent/tools/request_booking_otp.ts` matches the guest-typed email against `bookings.guest_email` via `ilike`; the response message is invariant regardless of match (anti-enumeration). A guest who never received a real email cannot know/guess the placeholder, so this tier already fails closed with zero extra guarding.
- `agent/skills/booking_change.md` already has a 5-step ownership ladder ending in `request_booking_change` (ask staff) when nothing else claims the booking — this is the existing "can't self-serve, contact staff" fallback the design relies on.
- `lib/booking-reminders.ts` (`sendOneReminder`, L580-585) only skips sending when `guest_email` is empty — it does not yet know about placeholder addresses.

## Architecture / data flow

```text
Guest chat, guest_email_required = false, guest declines email
  → book_appointment({ guestName, phone, email: undefined, start, ... })
  → resolveWorkspaceIdFromAgentContext()
  → getWorkspaceGuestPolicy(workspaceId).guestEmailRequired === false → continue
  → createWorkspaceBooking({ ..., email: undefined })
      email = input.email?.trim() || generatePlaceholderGuestEmail()
      → createBooking({ attendee: { email, ... } })  // Cal.com always gets a syntactically valid email
      → buildBookingRow(): bookings.guest_email = placeholder
      → upsertLeadAsBooked(): leads.email = placeholder (dedupe still by phone/session)

Guest chat, guest_email_required = true, guest declines email
  → book_appointment(...)
  → getWorkspaceGuestPolicy(workspaceId).guestEmailRequired === true, email missing
  → return { ok: false, error: appErrorMessage(BOOKING_EMAIL_REQUIRED) }  // before calling Cal.com at all
  → agent asks guest again, explains it's required for this business

Later cancel/reschedule, guest has no real email on file
  → list_my_appointments / cancel_appointment / reschedule_appointment
  → A1 (same chat session) or A2 (same visitor + phone last4) or B (manage code) → works, no email involved
  → C (email OTP): guest cannot supply the placeholder → tier never matches → falls through
  → agent-skills/booking_change.md step 5 → request_booking_change (staff) → guest told to contact staff
```

## Schema

New migration `supabase/migrations/20260804000002_guest_email_optional.sql`, following the pattern of `20260725000001_guest_booking_manage.sql`:

```sql
alter table public.workspaces
  add column if not exists guest_email_required boolean not null default true;

comment on column public.workspaces.guest_email_required is
  'If false, guest_email may be a system-generated placeholder (@no-email.invalid) — booking created via phone/name only';
```

No new table, no RLS change (existing owner-scoped policies on `workspaces` already cover it).

## Module map

| Path | Change |
|------|--------|
| `supabase/migrations/20260804000002_guest_email_optional.sql` | New column `workspaces.guest_email_required` |
| `lib/agent-booking-auth.ts` | `WorkspaceGuestPolicy` gains `guestEmailRequired: boolean`; `getWorkspaceGuestPolicy()` selects the new column |
| `lib/booking-create.ts` | `CreateWorkspaceBookingInput.email` becomes `email?: string \| null`; add `generatePlaceholderGuestEmail()` (private) and `isPlaceholderGuestEmail()` (exported), constant `NO_EMAIL_PLACEHOLDER_DOMAIN = "no-email.invalid"`; `createWorkspaceBooking()` resolves `email` once at the top and uses it for Cal.com payload, `buildBookingRow`, and `upsertLeadAsBooked` |
| `agent/tools/book_appointment.ts` | `email` input becomes `z.string().email().optional()`; after resolving `workspaceId`, call `getWorkspaceGuestPolicy()` and reject with a new error code when required and missing |
| `lib/errors/app-codes.ts` + `lib/errors/app-messages.ts` | New `APP_ERROR_CODE.BOOKING_EMAIL_REQUIRED` + internal-facing message (paraphrased by the LLM, not shown verbatim — matches existing `BOOKING_NOT_CLAIMABLE` etc. pattern) |
| `agent/skills/booking_intake.md` | Step 4 rewritten: email always asked, only enforced as blocking when the tool returns `BOOKING_EMAIL_REQUIRED` |
| `agent/skills/booking_change.md` | One clarifying line: step 3 (email OTP) only helps guests who gave a real email |
| `lib/booking-reminders.ts` | `sendOneReminder()` skip condition extended: `!email \|\| isPlaceholderGuestEmail(email)` → `"no_email"` |
| `lib/workspace-settings-types.ts` | `WorkspaceSettingsState` gains `guestEmailRequired?: boolean` |
| `app/dashboard/settings/actions.ts` | `saveWorkspaceSettings()` writes `guest_email_required: formData.get("guestEmailRequired") === "on"` |
| `app/_components/workspace-settings-form.tsx` | New checkbox next to the existing guest-cancel toggle |
| `messages/en.json` + `messages/vi.json` | Copy for the new Settings checkbox/helper text + "No email provided" label |
| `components/bookings-table.tsx`, booking detail sheet, `components/leads-table.tsx` | Wherever `guest_email` is rendered to staff, check `isPlaceholderGuestEmail()` and show a "No email provided" label instead |

**Do not** touch `lib/calcom.ts` — the Cal.com payload contract (`attendee.email` always present) stays exactly as-is; only the *value* fed into it changes upstream.

## UX

**Settings:** new checkbox "Require guest email" (default checked) alongside the existing guest cancel/reschedule toggles, same section, same save action.

**Guest chat (agent):** always asks for name, phone, email during intake — email framed as enabling self-service cancel/reschedule later. If the guest declines and the workspace doesn't require it, booking proceeds with a placeholder. If the workspace requires it, the tool rejects the booking attempt and the agent asks again, explaining this business needs an email.

**Dashboard (bookings/leads):** placeholder addresses never surface as raw text — always rendered as "No email provided" (i18n).

**Cancel/reschedule (agent):** unchanged decision tree; a guest with only phone/manage-code proof still self-serves normally. A guest who can't be identified by any tier is routed to `request_booking_change` (staff), never told the booking is cancelled.

## Errors

| Code | When |
|------|------|
| `BOOKING_EMAIL_REQUIRED` (new) | `guest_email_required = true` for the workspace and `book_appointment` was called without an email |
| Existing `BOOKING_NOT_CLAIMABLE` / `BOOKING_VERIFY_REQUIRED` | Unchanged — already generic enough to cover "no real email on file" guests |

Never surface the raw placeholder address or raw Cal.com/DB error strings to the guest or in dashboard UI (`lib/errors` formatters / `isPlaceholderGuestEmail` display guard).

## Security / correctness notes

- Placeholder token is `randomUUID()` (`node:crypto`, same module family as `lib/booking-manage-code.ts`) — unguessable, so it cannot be exploited via `request_booking_otp.ts`'s `ilike` match.
- `.invalid` TLD (RFC 2606) never resolves — Cal.com's own confirmation-email attempt to that address bounces silently, no real inbox involved, no deliverability side effects for the business.
- Lead dedupe (`lib/leads.ts`) keys on `phone`/`session_id`, not `email` — confirmed safe against placeholder collisions (each placeholder is unique per booking anyway).
- Reminders (`lib/booking-reminders.ts`) must skip placeholder addresses, otherwise the cron burns `MAX_REMINDER_ATTEMPTS` retries and fires a false-positive `notifyReminderFailure` notification to the owner for expected behavior.

## Testing (acceptance)

1. New workspace: `guest_email_required` defaults `true` → booking without email is rejected with a clear reason; booking with email succeeds unchanged (regression).
2. Owner unchecks "Require guest email" in Settings → guest books with only name + phone → Cal.com booking created successfully with the placeholder attendee email (verify against a real/sandbox Cal.com account — the assumption that Cal.com's API accepts a `.invalid`-domain email is not yet verified against a live account).
3. Dashboard bookings list, booking detail sheet, and leads table show "No email provided" for placeholder rows, never the raw address.
4. Guest who skipped email cancels/reschedules in the **same** chat session → succeeds via A1, no email involved.
5. Guest who skipped email returns in a **different** session/device with no manage code → email OTP silently fails to match → agent routes to `request_booking_change` (staff) → guest is never told the booking was cancelled.
6. Reminder cron does not attempt delivery (and does not fail-loop) for bookings with a placeholder email.
7. Workspace with `guest_email_required = true` (default) behaves identically to pre-change behavior end to end.

## Out of scope (v1)

- Dashboard manual-booking form (staff-entered bookings) — validation/UI untouched.
- Locale-based auto-defaulting of the toggle (e.g. auto-off for `vi` workspaces) — owner must opt in explicitly via Settings.
- Backfilling `guest_email_required` differently per existing workspace — all existing workspaces get the safe default (`true`), no behavior change until an owner opts out.
- Any change to the cancel/reschedule claim-tier logic itself (A1/A2/A+/B/C) — only how placeholder emails interact with tier C is affected (naturally, with no new code).

## Implementation order (high level)

1. Migration + `WorkspaceGuestPolicy` field + error code/message.
2. `lib/booking-create.ts` placeholder generation/detection + `book_appointment.ts` optional email + server-side policy gate.
3. `lib/booking-reminders.ts` placeholder skip guard.
4. Settings UI (types, action, form, i18n copy) + dashboard display guard (bookings/leads/detail sheet).
5. Agent skill copy (`booking_intake.md`, `booking_change.md`).
6. Manual test pass against acceptance criteria above (real Cal.com sandbox for #2); `npm run doctor` on changed UI files; `graphify update .`.

Detailed task breakdown belongs in the implementation plan (writing-plans skill), after this spec is approved.
