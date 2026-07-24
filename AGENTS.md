# eve Agent App

Multi-tenant AI booking SaaS: **Next.js** + **Supabase** + **eve agent** + **Cal.com**.
Public guests book via chat (`/b/[slug]`); owners operate via `/dashboard`.

## Shared agent instructions (Cursor + Claude + others)

This file is the **cross-tool** source of truth ([AGENTS.md](https://agents.md) convention).
Tool-specific scoped rules:

| Tool | Location |
|------|----------|
| Cursor | [`.cursor/rules/*.mdc`](.cursor/rules/) |
| Claude Code | [`.claude/rules/*.md`](.claude/rules/) + [`CLAUDE.md`](CLAUDE.md) imports this file |

## Commands

```bash
npm install
npx supabase start && npx supabase db reset
npm run dev          # Next + eve ensure
npm run typecheck
npm run doctor       # react-doctor on changed files (after UI work)
npm run doctor:full  # full-repo react-doctor scan
npm run build
npm run dev:eve      # eve agent REPL / channel
```

Do **not** assume the user wants you to start `localhost:3000` unless they ask.

**React Doctor agents (project):** only `.agents/skills`, `.claude/skills`, `.codex/skills` — do **not** run `npx react-doctor install --yes` (it floods every detected agent).

## Directory map (put new code in the right layer)

| Path | Responsibility |
|------|----------------|
| `app/` | Routes + thin pages. Prefer Server Components; put interactivity in `app/_components/` or `components/`. |
| `app/api/` | HTTP handlers; call `lib/*`, do not embed Cal/DB business logic. |
| `agent/` | eve agent only: `instructions.ts`, `channels/`, `tools/`, `skills/`. |
| `lib/` | Domain + data access (workspace, calcom, chat sessions, notifications). **Reusable, UI-free.** |
| `components/` | Shared UI. `ui/` = shadcn; `ai-elements/` = chat chrome; rest = product UI. |
| `messages/` | i18n catalogs (`en.json` / `vi.json`). |
| `supabase/migrations/` | Schema + RLS only. |

## Coding standards (clean + reusable)

1. **One concern per module** — if a file mixes UI + Cal.com + DB writes, split into `components/` + `lib/`.
2. **Reuse before inventing** — search `lib/` and existing tools first; extend helpers instead of copy-paste.
3. **Tenant always explicit** — resolve `workspaceId` via `resolveWorkspaceIdFromAgentContext` / `getDashboardUser`; never silent Pilot fallback when a tenant hint exists.
4. **Secrets** — Cal API keys via `getCalApiKeyForWorkspace` + `withCalApiKey`; encrypt with `lib/workspace-secrets.ts`.
5. **UI strings** — product chrome goes through `messages/*.json` + locale cookies (`eve_guest_locale` vs `eve_dashboard_locale`). Do not hardcode Vietnamese UI.
6. **React/Next performance** — follow skill `.agents/skills/vercel-react-best-practices/` (and `.cursor/rules/vercel-react-conventions.mdc` / `.claude/rules/vercel-react-conventions.md`). Priority: kill waterfalls → shrink bundles → server fetch hygiene → re-renders.
7. **User-facing errors** — codes + copy in `lib/errors/` (`AUTH_ERROR_CODE` / `formatAuthError`). Never show raw provider strings. See `.cursor/rules/errors.mdc`.
8. **Small diffs** — change only what the task needs; no drive-by refactors or unsolicited markdown docs.
9. **After React/UI edits** — run `npm run doctor` (react-doctor `--scope changed`). Fix errors before considering the task done. Full scan: `npm run doctor:full`.
10. **After code edits** — run `graphify update .` (see `.cursor/rules/graphify.mdc`).

## Non-negotiables

- Do not add `using (true)` RLS on tenant tables.
- Do not use global `CALCOM_API_KEY` for real tenants (Pilot `/chat` only).
- Do not invent booking slots — agent must call tools.
- Do not build multi-backend booking adapters unless explicitly requested.

## Read before coding

- Eve framework: `node_modules/eve/docs/` (or https://eve.dev/docs).
- Next.js in this repo: read `node_modules/next/dist/docs/` — APIs differ from training data.
- Architecture detail: `.claude/rules/architecture.md` (mirrored intent in `.cursor/rules/architecture.mdc`).

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
<!-- END:nextjs-agent-rules -->
