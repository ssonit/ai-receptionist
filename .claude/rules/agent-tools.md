---
description: Pattern to follow when adding or editing an eve agent tool
paths:
  - "agent/**"
---

Match `agent/tools/book_appointment.ts` / `agent/tools/check_availability.ts`:

1. `resolveWorkspaceIdFromAgentContext({ sessionId, auth })` (from
   `lib/workspace.ts`) to get the real tenant — never assume a single
   workspace, never call the deprecated `getPilotWorkspaceId()` from new code.
2. `getCalApiKeyForWorkspace(workspaceId)` + `withCalApiKey(key, () => ...)`
   around any `lib/calcom.ts` call — don't read a global Cal key.
3. `logAgentToolEvent(...)` on both success and failure paths, with
   `workspaceId` attached.
4. Return `{ ok: true, ... } | { ok: false, error }`, never throw past the
   tool boundary — the agent needs a structured result to explain to the
   guest, not an unhandled exception.
5. If the tool needs the workspace's timezone/locale/FAQ, fetch via
   `getWorkspaceById(workspaceId)` / `fetchWorkspaceFaq(workspaceId)` — don't
   hardcode `bookingConfig.timezone` as the source of truth for a real tenant
   (it's the Pilot-demo fallback only).

When adding a brand-new tool (e.g. `cancel_booking`, `reschedule_booking` —
neither exists yet): add the corresponding function to `lib/calcom.ts` first
(Cal.com v2 has cancel/reschedule endpoints), keep it credential-agnostic
(accept the key via `withCalApiKey`, don't read env internally), then wire
the agent tool on top following the 5 points above.
