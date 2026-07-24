---
description: Layering and reuse — where new code belongs; keep modules small and DRY
---

# Code structure & reuse

Goal: clean boundaries so features are easy to extend without copy-paste.

## Placement

| Kind of change | Put it here |
|----------------|-------------|
| Route / page shell | `app/**/page.tsx` (thin) |
| Client UI for a feature | `app/_components/*` or `components/*` |
| Domain logic, DB, Cal.com, cookies | `lib/*` |
| Agent-callable capability | `agent/tools/<name>.ts` (+ `lib/` helper first if reusable) |
| Product copy (EN/VI) | `messages/en.json` + `messages/vi.json` |
| Schema / RLS | `supabase/migrations/` |

## Reuse rules

- Before adding a helper, grep `lib/` and existing tools — extend the canonical module.
- Prefer pure functions in `lib/` over logic inside React components or route handlers.
- Shared types live next to domain (`lib/*-types.ts`) or colocated exports — do not duplicate interfaces across files.
- Server actions (`app/**/actions.ts`) orchestrate; they call `lib/*`, they do not reimplement Cal/DB clients.

## Anti-patterns

```ts
// BAD — Cal + UI + tenant resolution in one component
async function BookButton() {
  const key = process.env.CALCOM_API_KEY!;
  await fetch("https://api.cal.com/...");
}

// GOOD — UI calls action/lib; lib owns Cal + workspace
await bookAppointmentForWorkspace({ workspaceId, ... });
```

- No new "god files" (>400 lines) without splitting by concern.
- No parallel copies of slugify, locale parsing, or workspace resolution.
