---
description: React / Next UI patterns for reusable components in this repo
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
---

# React & UI

Also load **`.claude/rules/vercel-react-conventions.md`** and the
`vercel-react-best-practices` skill for performance patterns.

- Prefer Server Components by default; add `"use client"` only when needed (hooks, events, browser APIs).
- Reuse `components/ui/*` (shadcn) — do not invent parallel Button/Input primitives.
- Feature UI: extract shared pieces to `components/` once used in 2+ places; keep one-off UI in `app/_components/`.
- Dashboard chrome goes through `DashboardShell` / `LocaleProvider` (`kind="dashboard"`).
- Guest chat goes through `AgentChat` / `LocaleProvider` (`kind="guest"`).
- Follow existing styling tokens; do not introduce a second design system.
- Avoid `useMemo`/`useCallback` unless measured need (aligns with skill `rerender-simple-expression-in-memo`).
- Independent data loads: `Promise.all` (skill `async-parallel`).
- Heavy widgets (charts, magicui, large sheets): consider `next/dynamic` (skill `bundle-dynamic-imports`).
