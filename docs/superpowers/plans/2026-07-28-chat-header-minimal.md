# Chat header minimal strip — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Strip chat header to brand, workspace badge, info sheet, and Sign in / user menu.

**Architecture:** Edit `AgentChat` header JSX only; keep `headerEnd` injection from `WorkspaceBookingPage`.

**Tech Stack:** Next.js client component, next-intl, existing UI primitives.

## Global Constraints

- Do not remove forget API; only remove the header trigger.
- Do not delete i18n keys unless needed.
- Out of scope: landing/dashboard headers, locale UX elsewhere.

---

### Task 1: Simplify `agent-chat.tsx` header

**Files:** `app/_components/agent-chat.tsx`

- [x] Remove `LocaleToggle` from import and header.
- [x] Remove Dashboard `Link` from header.
- [x] Remove Not you? button and forget/reload handler.
- [x] Keep: Eve, badge, `{headerEnd}`, Sign in / `ChatUserMenu`.
- [x] Run `npm run doctor` after UI edit; `graphify update .`.

**Done when:** Header matches acceptance in `docs/superpowers/specs/2026-07-28-chat-header-minimal-design.md`.
