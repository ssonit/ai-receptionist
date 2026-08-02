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

## Route constants

All application route paths MUST use constants from `lib/routes.ts` — never hardcode string literals like `"/login"` or `"/dashboard"` in components, actions, or lib files.

```ts
import { ROUTES, bookingRoute, inviteRoute, embedRoute } from "@/lib/routes";

// Static routes
redirect(ROUTES.LOGIN);
<Link href={ROUTES.SIGNUP}>Create account</Link>
if (path === ROUTES.FORGOT_PASSWORD) { ... }

// Dynamic routes (template functions)
redirect(bookingRoute(workspaceSlug));
redirect(inviteRoute(token));
```

| Constant | Value |
|----------|-------|
| `ROUTES.HOME` | `"/"` |
| `ROUTES.LOGIN` | `"/login"` |
| `ROUTES.SIGNUP` | `"/signup"` |
| `ROUTES.FORGOT_PASSWORD` | `"/forgot-password"` |
| `ROUTES.RESET_PASSWORD` | `"/reset-password"` |
| `ROUTES.CHECK_EMAIL` | `"/check-email"` |
| `ROUTES.TERMS` | `"/terms"` |
| `ROUTES.AUTH_CALLBACK` | `"/auth/callback"` |
| `ROUTES.CHAT` | `"/chat"` |
| `ROUTES.CONSOLE` | `"/console"` |
| `ROUTES.DASHBOARD` | `"/dashboard"` |
| `ROUTES.DASHBOARD_SETUP` | `"/dashboard/setup"` |
| `ROUTES.DASHBOARD_SETTINGS` | `"/dashboard/settings"` |
| … | (see `lib/routes.ts` for full list) |

**Dynamic builders**: `bookingRoute(slug)`, `inviteRoute(token)`, `embedRoute(slug)`, `loginWithNext(path)`.

**Dashboard paths** have a legacy alias `DASHBOARD_PATH` in `lib/dashboard-access.ts` (derived from `ROUTES`) — prefer `ROUTES.*` for new code, but `DASHBOARD_PATH.*` is valid and already widely used.

**Exceptions**: Next.js `config.matcher` arrays (in `proxy.ts`) and `middleware.ts` route patterns must remain string literals — these are consumed at build time.

### Pattern

Follow the same `as const` + string-value pattern used by `APP_ERROR_CODE` (`lib/errors/app-codes.ts`) and `AUTH_ERROR_CODE` (`lib/errors/auth-codes.ts`):

```ts
export const ROUTES = {
  LOGIN: "/login",
  SIGNUP: "/signup",
  // ...
} as const;
```
