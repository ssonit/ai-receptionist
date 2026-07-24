---
name: deploy-vercel
description: eve-booking-specific deploy checklist — env vars, build pipeline quirks, migrations, rollback. Use together with the `deploy-to-vercel` skill (vendored from vercel-labs/agent-skills), which handles the actual CLI/git-push mechanics; this skill only covers what's specific to this app.
allowed-tools: Bash, Read
---

# Deploy runbook (eve-booking specifics)

For the actual "how do I invoke a Vercel deploy" mechanics (CLI detection,
team scoping, git-push vs `vercel deploy`, no-auth sandbox fallback), use the
**`deploy-to-vercel`** skill (`.claude/skills/deploy-to-vercel/SKILL.md`,
vendored as-is from `vercel-labs/agent-skills` — official, don't hand-edit
it, re-pull if it needs updating). This file only covers what that generic
skill can't know: this app's env vars, non-standard build pipeline,
migrations, and rollback specifics.

No `vercel.json` exists — this is a zero-config Next.js deploy, but the
build script is **not** plain `next build`, so read this before assuming a
default Vercel project setup "just works".

## Research first

Before debugging a build/deploy failure from first principles, check if it's
a known issue:

```bash
gh search issues "vercel" --repo vercel/eve
gh search issues "build" --repo vercel/eve --state all
```

`vercel/eve` is maintained by Vercel itself, so Vercel-specific build quirks
for this exact framework are the most likely place someone already hit and
documented the same problem, before spending time re-diagnosing it from the
build log alone.

## Build pipeline (why this isn't a stock Next.js deploy)

`package.json`:
```
"build": "npm run prepare:eve && next build"
"prepare:eve": "npm run patch:eve && eve build && node ./scripts/sync-eve-compile.mjs"
"postinstall": "node ./scripts/patch-eve-package-resolve.mjs"
```

- Vercel's default "Build Command" (empty → runs `npm run build`) already
  picks up `prepare:eve`, so no override should be needed — but **verify
  the first deploy's build log actually runs `eve build`**, not just
  `next build`, before trusting it.
- Do **not** configure Vercel to skip install scripts / use `--ignore-scripts`
  — `postinstall` patches eve's package resolution and is required for the
  build to succeed at all.

## Env vars (from `.env.example` — set all of these in the Vercel project)

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- At least one LLM provider key (`DEEPSEEK_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY` / `ANTHROPIC_API_KEY`) + `AGENT_DEFAULT_MODEL`.
- Cal.com (Pilot/demo path only — real tenants store their own key in DB,
  see `architecture.md`): `CALCOM_API_KEY`, `CALCOM_API_BASE_URL`,
  `CALCOM_EVENT_TYPE_SLUG`, `CALCOM_USERNAME`.
- `WORKSPACE_SECRETS_KEY` — **set this explicitly**, don't rely on the
  `SUPABASE_SERVICE_ROLE_KEY` fallback in production (see security-review
  skill — rotating the service role key would break decryption otherwise).
- `BOOKING_WORKSPACE_ID` / `NEXT_PUBLIC_BOOKING_WORKSPACE_ID` — Pilot demo
  fallback id, `BOOKING_NAME`, `BOOKING_TIMEZONE`, `BOOKING_MIN_NOTICE_HOURS`,
  `BOOKING_SYNC_*`.

## Database

1. Apply migrations to the target Supabase project, in order:
   `supabase/migrations/20260724000001_init_schema.sql` →
   `20260724000003_chat_branding.sql` → `20260724000004_slugify_vietnamese.sql`
   (via `supabase db push` or the SQL editor).
2. Run `supabase/seed.sql` to create the Eve Pilot demo workspace (needed for
   the marketing `/chat` page to work at all).
3. Confirm the `unaccent` Postgres extension is available/enabled (the
   slugify migration creates it — `create extension if not exists unaccent`
   — should be automatic on Supabase, but verify if using a different
   Postgres host).

## Post-deploy smoke test

Run through `.claude/skills/test-feature/SKILL.md`'s "Booking flow (chat)"
section against the deployed URL before calling the deploy done — a broken
env var typically fails silently as a chat error, not a build error.

## Rollback

- **App code**: Vercel keeps every previous deployment — instant rollback
  via the Vercel dashboard/CLI (`vercel rollback`) to the last known-good
  deployment, no rebuild needed.
- **Database migrations**: Postgres migrations here are forward-only (no
  paired down-migration files) — a bad migration is not a one-command
  rollback. Write and apply a new migration that reverses the change rather
  than trying to un-apply the old one, and check whether any row data
  written under the bad schema needs manual cleanup first.
- If a deploy broke a specific tenant (not the whole app) — check that
  tenant's `workspaces.cal_api_key_encrypted` / `cal_event_type_id` weren't
  the actual cause before rolling back app code; a per-workspace config
  issue looks identical to a broken deploy from the chat UI.
