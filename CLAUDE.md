@AGENTS.md

# eve-booking — Claude Code orientation

Multi-tenant AI booking SaaS (Next.js + Supabase + eve agent + Cal.com).

Shared standards live in `AGENTS.md`. Claude-scoped detail:

| Rule | When |
|------|------|
| `.claude/rules/graphify.md` | Always — run before Read/Grep/Glob/Bash exploration |
| `.claude/rules/architecture.md` | Always useful for orientation |
| `.claude/rules/code-structure.md` | Layering / DRY |
| `.claude/rules/typescript-conventions.md` | Constants + `type` / `interface` |
| `.claude/rules/tenant-isolation.md` | Any tenant data path |
| `.claude/rules/agent-tools.md` | Editing `agent/**` |
| `.claude/rules/supabase-migrations.md` | Editing `supabase/migrations/**` |
| `.claude/rules/i18n.md` | Locale / messages / chat chrome |
| `.claude/rules/react-ui.md` | `app/**/*.tsx`, `components/**/*.tsx` |
| `.claude/rules/vercel-react-conventions.md` | Vercel React/Next perf (skill-backed) |
| `.claude/rules/react-doctor.md` | After UI work — `npm run doctor` |
| `.claude/rules/errors.md` | User-facing errors / `lib/errors` |
| `.claude/rules/local-dev.md` | Bootstrapping local env |

Skills (invoke when relevant):

- `.claude/skills/react-doctor` — scan changed React code (`npm run doctor`)
- `.claude/skills/vercel-react-best-practices` — React/Next performance ([vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills))
- `.claude/skills/code-review`, `test-feature`, `security-review`, `deploy-vercel` (this app's specifics), `deploy-to-vercel` (official Vercel CLI skill)

Cursor / Codex skill copies (same intent): `.agents/skills/react-doctor`, `.codex/skills/react-doctor`. Do not run `react-doctor install --yes`.

Cursor uses the parallel set under `.cursor/rules/*.mdc` (same intent, MDC frontmatter).

## One-liners

- Workspace for tools: `resolveWorkspaceIdFromAgentContext()` in `lib/workspace.ts`.
- Cal keys: per-workspace encrypted (`lib/workspace-secrets.ts`); env key = Pilot `/chat` only.
- RLS: scoped by `workspace_id` — never bring back `using (true)` pilot policies.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.
