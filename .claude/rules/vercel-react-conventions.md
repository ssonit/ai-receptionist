---
description: Vercel React/Next performance conventions — read vercel-react-best-practices skill when touching UI
paths:
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
---

# Vercel React best practices (required)

This repo installs [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) →
`.claude/skills/vercel-react-best-practices` (mirrored at `.agents/skills/` for
Cursor/other tools — same content, update both if you re-run `npx skills add`).

**Before writing or refactoring React/Next UI**, read:

1. `.claude/skills/vercel-react-best-practices/SKILL.md` (priority table)
2. Relevant rule files under `.../rules/` for the change (prefix by impact)

## Eve conventions mapped to skill priorities

Apply in this order (do not bikeshed low-priority `js-` / `advanced-` on every PR):

1. **Waterfalls (`async-*`)** — independent awaits → `Promise.all`; start work early in route handlers; cheap guards before `await`.
2. **Bundle (`bundle-*`)** — heavy chat/marketing widgets → `next/dynamic`; prefer analyzable imports; icons via packages listed in `experimental.optimizePackageImports` (`lucide-react`, `@tabler/icons-react`).
3. **Server (`server-*`)** — keep pages thin; fetch in parallel; minimize props passed into client components; authenticate server actions like API routes.
4. **Client fetch (`client-*`)** — dedupe listeners; avoid N identical client fetches for the same resource.
5. **Re-render (`rerender-*`)** — no components defined inside components; derive state in render; `startTransition` for non-urgent updates; do not sprinkle `useMemo`/`useCallback` without need (React Compiler-friendly).

## Conflict resolution

- **Tenant isolation / Cal secrets / RLS** beat perf micro-optimizations.
- **eve / Next docs in this repo** beat generic Next advice from training data.
- Full rule text lives in the skill — do not paste all 70 rules into chat.
