---
name: code-review
description: Project-specific code review checklist for eve-booking — use alongside (not instead of) the general /code-review flow when reviewing a diff in this repo.
allowed-tools: Read, Grep, Glob, Bash
---

# eve-booking code review checklist

Run this in addition to general code review. It catches the mistakes this
codebase has actually made before (see `.claude/rules/architecture.md` "Known
gaps" and the RLS incident in `.claude/rules/supabase-migrations.md`).

## When to use this skill

When reviewing a diff or PR that touches `agent/tools/**`, `lib/workspace*.ts`,
`lib/calcom.ts`, or `supabase/migrations/**` in this repo — anything else is
covered fine by the general review flow alone.

## Automated first pass (run before manual review)

This repo has no eslint/biome configured yet — `npm run typecheck` (`tsc
--noEmit`) is the **only** automated check available today. Always run it
before the manual checklist below; don't rely on manual review to catch
what a free, already-configured tool would catch instantly:

```bash
npm run typecheck
```

If the diff needs a linter that doesn't exist yet, say so as a finding
rather than silently skipping automated checks (see security-review's
"Research first" for how to check what similar projects use).

## Severity labels

Label every finding so it's actionable, not just noted:

- **blocking** — tenant-isolation break, secret leak, or a new `using (true)`
  policy. Do not merge.
- **important** — deviates from an established pattern (e.g. a tool that
  doesn't call `resolveWorkspaceIdFromAgentContext`) without a stated reason.
- **nit** — style/naming, safe to leave for a follow-up.

## Research first

Before flagging something as wrong or proposing a fix from scratch, check
whether there's already an established answer on GitHub — prefer that over a
freshly-invented opinion:

```bash
gh search code "<pattern>" --repo vercel/eve
gh search issues "<topic>" --repo vercel/eve
gh search code "<pattern>" --repo calcom/cal.com   # booking/availability/RLS-style concerns
```

`vercel/eve` is the agent framework this app is built on — check it for the
canonical way to structure tools/instructions/channels before improvising.
`calcom/cal.com` is a large, mature OSS booking app doing the exact same
availability/booking-integrity problem this repo integrates with — worth
checking how they handle a concern before reviewing this app's version of it
in isolation.

## Tenant isolation

- [ ] Any new/changed `agent/tools/*.ts` follows `.claude/rules/agent-tools.md`
      — resolves workspace via `resolveWorkspaceIdFromAgentContext`, never
      the deprecated `getPilotWorkspaceId()`.
- [ ] Any new dashboard page/action reads the workspace from the logged-in
      user (`lib/dashboard-user.ts` / `profiles.workspace_id`), not from an
      env var or a hardcoded id.
- [ ] Any new Supabase table/policy follows `.claude/rules/supabase-migrations.md`
      — scoped by `workspace_id`, no `using (true)`.
- [ ] Any new secret (API key, token, webhook secret) is stored via
      `lib/workspace-secrets.ts` encryption, not a plaintext column, and not
      logged (check `logAgentToolEvent` `meta` payloads don't include it).

## Cal.com integration

- [ ] Calls into `lib/calcom.ts` get their API key via `withCalApiKey(key, fn)`
      — no new code path reads a Cal.com key from `bookingConfig`/env
      directly except the Pilot-demo path in `lib/workspace.ts`
      `getCalApiKeyForWorkspace()`.
- [ ] Booking creation re-validates the slot is still open right before
      calling `createBooking` (see `book_appointment.ts`'s `stillOpen`
      check) — never trust a slot the model "remembers" from earlier in the
      conversation without a fresh check.

## Slug logic

- [ ] If `slugifyWorkspaceName` (TS, `lib/workspace.ts`) or
      `slugify_workspace_name` (SQL, in the migrations) changed, the other
      one was updated to match — they can't share code (one runs in a
      Postgres trigger, one in the browser) but must agree on output.

## General

- [ ] New agent tool returns `{ ok: true, ... } | { ok: false, error }`,
      never throws past the tool boundary.
- [ ] i18n: user-facing chat/dashboard strings respect the existing VI/EN
      locale split (`lib/locale.ts`, `lib/i18n.ts`) rather than hardcoding
      one language.

## Report format

```
### [blocking|important|nit] <one-line summary>
File: path:line
Why: <concrete failure scenario, not just "this looks wrong">
Fix: <what to change, or point to the pattern in .claude/rules/agent-tools.md>
```
