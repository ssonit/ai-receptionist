---
description: Local dev environment setup for eve-booking — step 0 before any other workflow (review/test/deploy)
---

```bash
npm install                 # triggers postinstall (patch-eve-package-resolve.mjs)
cp .env.example .env.local   # fill in Supabase/LLM/Cal.com keys, see below
npx supabase start           # local Postgres + auth; copy keys from `supabase status`
npx supabase db reset         # applies supabase/migrations/*.sql + supabase/seed.sql
npm run dev                   # runs ensure:eve, then next dev
```

Minimum `.env.local` to get `/chat` (Eve Pilot demo) working: Supabase URL +
anon key + service role key (from `supabase status`), one LLM provider key
(`DEEPSEEK_API_KEY` is cheapest), `CALCOM_API_KEY` pointed at a **sandbox**
Cal.com account (not a real tenant's calendar — see `architecture.md`).

`EVE_BASE_URL=http://127.0.0.1:2000` pins the eve dev sidecar to a fixed
port. Without it, `withEve` spawns `eve dev` on a random port each `npm run
dev` and caches that origin in memory for the process lifetime — if the
sidecar dies mid-session (common on Windows), `/chat` hangs forever on
"opening sandbox session..." with no error, because the cached origin is
never re-validated. `npm run dev` auto-starts/health-checks the pinned
sidecar via `scripts/ensure-eve-compile.mjs`; if it dies while `next dev`
keeps running, restart it independently with `npm run dev:eve:pinned` — no
need to restart `next dev`.

Full list: `.env.example`. Full workflow after this: implement (see
`agent-tools.md` if touching `agent/**`, `supabase-migrations.md` if touching
`supabase/migrations/**`) → `code-review` skill → `test-feature` skill →
`security-review` skill → `deploy-vercel` skill.
