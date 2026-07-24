---
name: security-review
description: eve-booking-specific security checklist (tenant isolation, secret handling). Use alongside the general security-review skill — this one encodes risks specific to this app's multi-tenant model.
allowed-tools: Read, Grep, Glob, Bash
---

# eve-booking security review checklist

The general security-review skill covers OWASP-style basics. This adds
checks specific to this app's architecture — read
`.claude/rules/architecture.md` first if you haven't already.

## When to use this skill

Before/after any change touching `agent/tools/**`, `lib/workspace*.ts`,
`lib/calcom.ts`, `supabase/migrations/**`, or anything handling the Cal.com
API key — run this alongside (not instead of) the general security-review
skill.

## Severity labels

- **confirmed** — reproduced or directly visible in the code (e.g. an actual
  `using (true)` policy on a tenant table).
- **plausible** — the code path looks exploitable but wasn't traced end to
  end; flag for a closer look rather than asserting it as fact.

## Research first

Before manually re-deriving whether a dependency has a known issue, check if
it's already documented upstream:

```bash
gh api /repos/supabase/supabase-js/security-advisories 2>/dev/null
gh search issues "RLS" --repo supabase/supabase --state open
gh search issues "security" --repo vercel/eve
```

Known CVEs/advisories in `next`, `@supabase/supabase-js`, `ai`, or `eve`
should be checked against the installed versions in `package.json` before
assuming a from-scratch audit is the only way to find a bug — someone
upstream may have already found and disclosed it.

## Tenant isolation (the app's main historical risk)

- [ ] Every table holding tenant data has RLS enabled with policies scoped
      by `workspace_id` — grep migrations for `using (true)` and treat any
      hit as a finding (this exact pattern caused a real cross-tenant read
      risk before `20260724000001_init_schema.sql` fixed it).
- [ ] `resolveWorkspaceIdFromAgentContext()` (`lib/workspace.ts`) still
      **throws** rather than falling back to the Pilot workspace whenever a
      tenant hint (`workspaceSlug` / `chatSessionId`) was present but failed
      to resolve. Don't "fix" a bug report by making this permissive —
      silent fallback means writing a real visitor's data into the wrong
      tenant, or into the public demo workspace.
- [ ] Dashboard pages/actions get the workspace from the authenticated
      user's own `profiles.workspace_id`, never from a query param, header,
      or env var that a client could influence.

## Secrets

- [ ] Cal.com API keys are only ever handled via
      `lib/workspace-secrets.ts` `encryptSecret`/`decryptSecret` — never
      logged (check `logAgentToolEvent` meta payloads, error messages sent
      to the client, and Sentry/console output), never returned in any API
      response body.
- [ ] `WORKSPACE_SECRETS_KEY` is set explicitly in production — the fallback
      to `SUPABASE_SERVICE_ROLE_KEY` in `lib/workspace-secrets.ts` is a dev
      convenience; relying on it in prod means rotating the service role key
      would silently break decryption of every stored Cal.com key.
- [ ] No Cal.com key, Supabase service role key, or LLM provider key is ever
      sent to the browser (check any new `NEXT_PUBLIC_*` env var doesn't
      accidentally expose one of these).

## Public surfaces

- [ ] `/signup` has no rate limiting or invite gating today — if abuse
      becomes a real concern, that's the first place to add one (not
      implemented as of this writing, see `architecture.md` known gaps).
- [ ] `/b/[slug]` and `/chat` are anonymous/public by design — confirm any
      new field exposed on `getPublicBookingWorkspace()` is meant to be
      public (it's rendered to any visitor, not just the workspace owner).

## Cal.com API surface

- [ ] Booking creation always re-checks slot availability server-side right
      before writing (`stillOpen` pattern in `book_appointment.ts`) — a
      client/model should never be trusted to supply a valid slot without
      re-verification, since that's how double-bookings or booking into a
      stale/expired slot happen.
