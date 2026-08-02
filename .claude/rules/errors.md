---
description: User-facing errors — constants, mapping, never leak provider strings
paths:
  - "lib/errors/**"
  - "app/auth/**"
  - "app/**/actions.ts"
---

# Error conventions

1. **Never** return raw provider/API/DB strings to the UI.
2. Codes: `lib/errors/*-codes.ts` (`as const`).
3. Copy: `lib/errors/*-messages.ts` keyed by codes.
4. Formatters map provider errors; log raw server-side only.
5. Actions use `@/lib/errors` helpers — no hardcoded English error strings in `actions.ts` for failure paths.
6. Prefer shared `APP_ERROR_CODE` for dashboard; auth keeps its own codes + `formatAuthError`.

```ts
import {
  AUTH_ERROR_CODE,
  authErrorMessage,
  formatAuthError,
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
  formatUnknownError,
} from "@/lib/errors";

// Auth
return { error: formatAuthError(error, "signIn") };

// Dashboard
if (!user) return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
if (error) return { error: formatDbError(error) };
catch (e) {
  return { error: formatUnknownError(e, APP_ERROR_CODE.SYNC_FAILED) };
}
```

See: `lib/errors/auth-*.ts`, `app-codes.ts`, `app-messages.ts`, `format.ts`.

The `as const` + string-value pattern used here (`APP_ERROR_CODE.SIGN_IN_REQUIRED = "sign_in_required"`) is also used for route constants in `lib/routes.ts` (`ROUTES.LOGIN = "/login"`).
