---
description: eve-booking multi-tenant architecture — workspace/tenant model and directory map
---

> Reflects the working tree as of 2026-07-24, including a large uncommitted
> change (`git status` — ~70 files) that turned the original single-tenant
> pilot into a real multi-tenant booking SaaS. Re-check `git status`/`git log`
> before trusting this if it's been a while — this is a snapshot, not
> generated docs.

## Multi-tenancy model

- **`workspaces`** = one tenant (business). `profiles.workspace_id` links a
  user to their org. One user = one workspace today (no invite-to-existing-
  workspace flow yet).
- **Public booking surfaces**:
  - `/b/[slug]` — real tenant's own page (branding, FAQ, chat), resolved via
    `workspaces.slug`. See `app/b/[slug]/page.tsx`, `lib/workspace.ts`
    `getPublicBookingWorkspace()`.
  - `/chat` — the **Eve Pilot demo only** (marketing sandbox linked from the
    landing page `/`), always uses the env `CALCOM_API_KEY`. Never a real
    tenant's calendar/key.
- **Workspace resolution for agent tools**: `lib/workspace.ts`
  `resolveWorkspaceIdFromAgentContext()`. Flow: `agent/channels/eve.ts` stamps
  `workspaceSlug` / `chatSessionId` auth attributes from the
  `x-eve-w` / `x-eve-chat-session` request headers → tool resolves workspace
  from `chat_sessions.workspace_id` or the slug → **refuses to fall back to
  Eve Pilot if a tenant hint was present but didn't resolve** (prevents
  writing a real visitor's booking into the demo workspace).
- **Cal.com credentials**: per-workspace, encrypted at rest
  (`lib/workspace-secrets.ts`, AES-256-GCM), stored in
  `workspaces.cal_api_key_encrypted`, fetched via
  `getCalApiKeyForWorkspace(workspaceId)`, injected per-call via
  `withCalApiKey(key, fn)` in `lib/calcom.ts`. The global `CALCOM_API_KEY` env
  var is **only** valid for the Pilot demo workspace — real tenants must have
  their own key or the tool call errors out.
- **Signup**: `handle_new_user` trigger (see
  `supabase/migrations/20260724000001_init_schema.sql` and
  `20260724000004_slugify_vietnamese.sql`) creates a **new** workspace per
  signup (not a hardcoded pilot id), slug via Postgres `slugify_workspace_name()`
  (Vietnamese-aware, `unaccent` extension, dedupes collisions with `-1`/`-2`).
  The client has its own copy of the same slugify logic
  (`lib/workspace.ts` `slugifyWorkspaceName()`) for live preview in
  `workspace-settings-form.tsx` and for server actions — keep both in sync by
  hand if you touch the slug algorithm, they can't share code (one runs
  inside a Postgres trigger, the other in the browser).
- **RLS**: every tenant table is scoped by
  `workspace_id in (select workspace_id from public.profiles where id = auth.uid())`.
  Migrations were squashed into a single `20260724000001_init_schema.sql` —
  no permissive `using (true)` "(pilot)" policies remain.

## Directories

- `app/` — Next.js routes. `app/page.tsx` = product marketing landing page
  (sells the SaaS to prospective business owners, not per-tenant).
  `app/dashboard/` = staff/owner console (bookings, leads, FAQ, meeting types,
  settings, setup wizard, notifications, analytics). `app/b/[slug]/` = public
  per-tenant booking page. `app/chat/` = Pilot demo chat. `app/api/chat/` =
  chat session CRUD backing the chat UI. `app/api/dashboard/` = dashboard-only
  endpoints (search, notifications).
- `agent/` — the eve agent. `agent.ts` = model routing (cost-first, picks
  DeepSeek/Gemini/Claude per turn via `lib/models.ts`). `instructions.ts` =
  dynamic system prompt built per-request from the resolved workspace's FAQ/
  branding/locale. `tools/*.ts` = one file per AI-callable tool
  (`book_appointment`, `check_availability`, `log_lead`, plus generic
  `bash`/`glob`/`grep`/`read_file`/`write_file`). `channels/eve.ts` = auth +
  tenant-header stamping for the chat endpoint. `skills/` = FAQ/booking-intake
  prompt fragments (eve agent skills — unrelated to `.claude/skills/`).
- `lib/` — data access + domain logic, no UI. Notable: `workspace.ts` (tenant
  resolution), `calcom.ts` (Cal.com v2 client, credential passed in per-call),
  `workspace-secrets.ts` (encrypt/decrypt), `workspace-cal.ts` (AI booking
  event-type resolution), `notifications*.ts`, `sync-cal-bookings.ts`
  (mirrors Cal.com booking state → Supabase, detects cancellations/
  reschedules done on Cal.com's side), `dashboard-user.ts` (resolves the
  logged-in user's own workspace for dashboard pages).
- `components/` — `ui/` = shadcn primitives, `ai-elements/` = chat rendering,
  `magicui/` = decorative landing-page effects, rest = app-specific
  (dashboard shell/sidebar, tables, setup wizard, notifications bell/inbox).
- `supabase/migrations/` — schema. Currently just
  `20260724000001_init_schema.sql` (full consolidated schema + RLS) +
  `20260724000003_chat_branding.sql` + `20260724000004_slugify_vietnamese.sql`
  (earlier incremental pilot-era migrations were squashed away).
  `supabase/seed.sql` seeds the Eve Pilot demo workspace + FAQ.
- `messages/` — EN/VI product chrome (`eve_guest_locale` vs `eve_dashboard_locale`).
- Agent/editor rules — see `docs/AGENT_RULES.md`, `.claude/rules/`, `.cursor/rules/`.

## Known gaps (don't assume these exist)

- No `cancel_booking` / `reschedule_booking` agent tool — cancellations/
  reschedules are only detected one-way from Cal.com via
  `lib/sync-cal-bookings.ts`, never agent-initiated today.
- No automated test suite (no vitest/jest/playwright in `package.json`) —
  verification is manual (see `.claude/skills/test-feature/SKILL.md`).
- No staff-invite-to-existing-workspace flow — every signup creates a brand
  new workspace.
- No public-signup gating flag — `/signup` is reachable by anyone who finds
  the URL; low risk today only because each real tenant still needs someone
  to manually configure their Cal.com key/meeting type before the workspace
  is usable.
