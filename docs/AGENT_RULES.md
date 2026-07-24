# Agent rules (Cursor + Claude)

This project follows the [AGENTS.md](https://agents.md) / [Claude Code CLAUDE.md](https://code.claude.com/docs/en/claude-md) / [Cursor project rules](https://cursor.com/docs/rules) pattern:

- **`AGENTS.md`** — cross-tool always-on brief (stack, dirs, commands, non-negotiables).
- **`CLAUDE.md`** — `@AGENTS.md` import + Claude orientation.
- **`.claude/rules/*.md`** — Claude path-scoped or topic rules (`paths:` frontmatter).
- **`.cursor/rules/*.mdc`** — Cursor rules (`alwaysApply` / `globs` / `description`).

Keep rules short, actionable, and duplicated intentionally between Claude/Cursor so either tool works on Windows without symlinks. When you change a policy, update **both** copies (and the AGENTS.md summary if it is a non-negotiable).

## React / Next performance skill

Installed via:

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices
```

- Canonical copy: `.agents/skills/vercel-react-best-practices/`
- Claude mirror: `.claude/skills/vercel-react-best-practices/`
- Conventions wiring: `.cursor/rules/vercel-react-conventions.mdc` + `.claude/rules/vercel-react-conventions.md`
- Lockfile: `skills-lock.json`

Agents must read the skill (and relevant `rules/*.md`) when writing or reviewing React/Next UI — not only the short convention summary.

## React Doctor (verification)

```bash
npm run doctor       # changed files
npm run doctor:full  # whole repo
```

- Skills kept **only** for Claude / Cursor / Codex: `.claude/skills/react-doctor`, `.agents/skills/react-doctor`, `.codex/skills/react-doctor`.
- Rules: `.cursor/rules/react-doctor.mdc`, `.claude/rules/react-doctor.md`.
- CI: `.github/workflows/react-doctor.yml`.
- **Do not** use `npx react-doctor install --yes` — it installs into every detected agent.
