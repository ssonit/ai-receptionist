---
description: RLS requirement for new/changed Supabase tables
paths:
  - "supabase/migrations/**"
---

This app was burned once already by permissive RLS (`using (true)` "(pilot)"
policies that were later squashed away in `20260724000001_init_schema.sql`).
Do not reintroduce that pattern.

Every table that stores tenant data **must** have RLS enabled with policies
scoped like this (adjust the column for tables that reach `workspace_id` only
through a join, e.g. `chat_messages` via `chat_sessions`):

```sql
create policy "Users can read workspace <table>"
on public.<table>
for select
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);
```

Checklist for any migration touching a tenant table:

- [ ] `workspace_id` column present (directly, or reachable via a documented
      join) — no table should be globally readable by any authenticated user.
- [ ] SELECT/INSERT/UPDATE/DELETE policies all use the scoped subquery above,
      not `using (true)`.
- [ ] If the table stores a secret (API key, token) — it must be encrypted
      via `lib/workspace-secrets.ts` (`encryptSecret`/`decryptSecret`), never
      a plaintext column, and should generally only be readable through the
      admin/service-role client server-side, not exposed via `authenticated`
      SELECT policies at all.
- [ ] `handle_new_user` trigger stays consistent if `profiles`/`workspaces`
      shape changes — it's the only thing wiring a new signup to a new
      workspace (see `20260724000001_init_schema.sql` +
      `20260724000004_slugify_vietnamese.sql`).

## Workflow: adding a new migration

1. New file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql` — timestamp
   must sort after the latest existing one.
2. Never edit an already-applied migration file (one already merged/deployed)
   — write a new one that alters it instead, or nobody's local DB / prod DB
   stays in sync.
3. Test locally before opening a PR: `npx supabase db reset` (re-applies
   every migration + `seed.sql` from scratch) — this is the fastest way to
   catch an ordering/syntax mistake.
4. If the change is tenant-data-shaped, run it past the checklist above
   before considering it done.
