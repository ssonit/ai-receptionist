---
name: test-feature
description: Manual end-to-end test runbook for eve-booking features (booking flow, tenant isolation, dashboard). No automated test suite exists yet — use this + the `run` skill to verify changes in the browser before calling a feature done.
allowed-tools: Bash, Read, mcp__Claude_Browser__*
---

# Manual feature test runbook

There is no vitest/jest/playwright in this repo (`package.json` has no test
script). Until one exists, verification means actually running the app and
using it.

**Don't install a separate browser-automation skill for this (e.g. a
Playwright skill) — it would duplicate tooling that's already available.**
Use the `run` skill to launch the dev server, then drive it directly with
the `mcp__Claude_Browser__*` tools already available in this environment:
`navigate` / `computer` (click, type, screenshot) / `read_page` to assert on
structure / `read_console_messages` and `read_network_requests` to catch
silent failures a screenshot wouldn't show (e.g. a failed Cal.com fetch that
still renders an empty-but-valid-looking chat response).

## Research first

If/when it's time to add automated tests, don't design a test setup from
scratch — search GitHub for how comparable projects already solved it:

```bash
gh search code "playwright.config" --repo calcom/cal.com
gh search issues "testing" --repo vercel/eve
```

`calcom/cal.com` is OSS and has mature test coverage for exactly the
availability/booking-integrity flows this app re-implements — its test
patterns (fixtures, seat/slot race conditions, timezone edge cases) are more
likely to have already found the bugs this app hasn't hit yet than a
from-scratch test plan would.

## Setup

```bash
npx supabase start   # if testing against local Supabase
npm run dev
```

Need at least: Supabase keys, one LLM provider key, `CALCOM_API_KEY` (for the
`/chat` Pilot path) in `.env.local`. See `.env.example` for the full list.

## Booking flow (chat)

1. Open `/chat` (Pilot demo) — ask a FAQ question, confirm the answer matches
   `supabase/seed.sql` content for the Eve Pilot workspace.
2. Ask to book an appointment. Confirm the agent calls `check_availability`
   before offering a time (never invents a slot), then `book_appointment`
   only after you confirm a specific slot.
3. Confirm the booking appears in Cal.com's calendar AND in
   `app/dashboard/bookings` after a sync (or immediately, if the mirror write
   succeeded inline).
4. Confirm a notification was created (`app/dashboard/notifications`).

## Tenant isolation (if testing multi-tenant changes)

1. Create/seed two workspaces with two different `slug`s and two different
   Cal.com API keys.
2. Open `/b/tenant-a` and `/b/tenant-b` in separate sessions, book on each.
3. Confirm tenant A's booking never appears in tenant B's Cal.com calendar,
   dashboard, or notifications, and vice versa.
4. Try a slug that doesn't exist (`/b/does-not-exist`) — must 404 / clean
   error, must **not** silently fall back to the Pilot workspace (this is
   the explicit safety check in `resolveWorkspaceIdFromAgentContext`).

## Dashboard (authenticated)

1. Log in as an owner, confirm `/dashboard` shows only that owner's own
   workspace's bookings/leads — not another workspace's data.
2. Exercise the settings/setup pages (`workspace-settings-form.tsx`,
   `meeting-types-form.tsx`, `faq-settings-form.tsx`) and confirm changes
   persist and show up correctly on the matching `/b/[slug]` page.

## Regression check after touching `lib/calcom.ts` or `lib/workspace.ts`

Re-run the booking flow above at minimum — these two files are the most
central to correctness (credential resolution + tenant resolution); a subtle
bug here silently mixes tenants rather than throwing an obvious error.
