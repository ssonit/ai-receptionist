# Chat header minimal strip

**Date:** 2026-07-28  
**Status:** Approved (conversation) — awaiting spec review before implementation plan  
**Scope:** Guest/demo chat chrome at `/chat` and `/b/[slug]` (shared `AgentChat` header)

## Goal

Simplify the chat header so it only shows what guests need for booking chat: brand, which workspace they’re talking to, workspace details, and auth entry.

## Keep

| Position | Element | Notes |
|----------|---------|--------|
| Left | Sessions toggle (mobile) + **Eve** link → `/` | Unchanged |
| Center | Workspace badge (name + agent status) | Unchanged |
| Right | Workspace **info** sheet (`headerEnd` / `WorkspaceInfoSheet`) | Shown only when workspace has details |
| Right | **Sign in** (`RainbowButton`) or `ChatUserMenu` when logged in | Unchanged |

## Remove from header

| Element | Rationale |
|---------|-----------|
| `LocaleToggle` (EN/VI) | Not essential for booking; locale stays cookie/`en` default |
| **Dashboard** text link | Redundant; still available inside `ChatUserMenu` when signed in |
| **Not you?** forget-session button | Rare affordance; clutter for most guests |

## Unchanged

- Demo banner under header (`demoMode`)
- Manage-link notice, loading/error states, message list, composer
- `WorkspaceInfoSheet` behavior and content
- Tenant headers / session bootstrap / forget API (API remains; UI trigger removed)
- Landing page and dashboard headers (out of scope)

## Implementation

**Primary file:** `app/_components/agent-chat.tsx`

1. Remove `LocaleToggle` from the header JSX (and unused import if nothing else uses it in that file).
2. Remove the `/dashboard` `Link` in the header.
3. Remove the **Not you?** `<button>` and its `/api/chat/forget` + reload handler.
4. Keep `{headerEnd}` so `workspace-booking-page.tsx` continues to inject the info sheet.
5. Keep Sign in / `ChatUserMenu` as-is.

**No changes expected** to `workspace-booking-page.tsx`, `chat/page.tsx`, or i18n catalogs (unused keys may remain; no requirement to delete copy).

## Out of scope

- Moving locale control elsewhere
- Replacing forget-session with another UX
- Redesigning badge, sidebar, or landing header
- Committing/docs beyond this spec unless requested

## Acceptance

- Chat header shows only: brand (+ sessions on mobile), workspace badge, info (when applicable), Sign in or user menu.
- No EN pill, Dashboard link, or Not you? in the header.
- Booking chat and demo mode still load and send messages.
- Logged-in users can still open Dashboard via the avatar menu.
