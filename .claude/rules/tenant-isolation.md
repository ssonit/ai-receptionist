---
description: Multi-tenant isolation — never leak Pilot/demo workspace into real tenants
---

# Tenant isolation

Every guest or dashboard write must be scoped to an explicit `workspace_id`.

## Agent / chat

1. Prefer `resolveWorkspaceIdFromAgentContext({ sessionId, auth })` from `lib/workspace.ts`.
2. Stamp tenant via `x-eve-w` + `x-eve-chat-session` (see `agent/channels/eve.ts`).
3. If a tenant hint is present but unresolved → **fail**, do not fall back to Eve Pilot.
4. Chat APIs under `app/api/chat/**` must use `getChatWorkspaceId(request)` (or equivalent) — include `?w=` on client fetches for `/b/[slug]`.

## Dashboard

- Use `getDashboardUser()` / profile `workspace_id`.
- Queries: always `.eq("workspace_id", workspaceId)` (or join-scoped RLS). Never load "all workspaces" for a normal owner.

## Secrets

- Real tenants: encrypted Cal key via `getCalApiKeyForWorkspace` + `withCalApiKey`.
- Env `CALCOM_API_KEY` only for Pilot `/chat` demo.

## Quick check

If a bug report is "data showed up in the wrong workspace", start at workspace resolution + missing `?w=` / headers — not the LLM prompt.
