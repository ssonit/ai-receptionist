# Supabase migrations workflow

## Active path

| What | Location |
|------|----------|
| **Schema (single init)** | `supabase/migrations/20260724000001_init_schema.sql` |
| **Demo / pilot data** | `supabase/seed.sql` |
| **Old incremental history** | `supabase/migrations_archive/` (reference only) |

```bash
npx supabase start
npx supabase db reset   # init_schema.sql + seed.sql
```

`db reset` recreates the local DB, applies the init migration, then seeds Eve Pilot.

## Schema changes going forward

1. Add a **new** timestamped file under `supabase/migrations/` (never edit `init_schema` after it ships).
2. Keep `supabase/baseline/001_schema.sql` in sync when you change the desired end-state (optional mirror for reading).

## Seed vs schema

- **Schema** — tables, RLS, triggers in `migrations/`
- **Seed** — Eve Pilot workspace + demo FAQ in `seed.sql` (local/demo + marketing `/chat` sandbox)

**Cal.com:** Eve Pilot credentials must use a sandbox calendar only. Tenant Cal keys live on each workspace after setup.

Signup creates a new workspace via `handle_new_user()`; it does not attach users to the pilot row. Public tenant URL: `/b/{slug}`. Product demo: `/chat` (always pilot).

## Archived history

See [`supabase/migrations_archive/README.md`](../supabase/migrations_archive/README.md) and [`supabase/MIGRATION_INVENTORY.md`](../supabase/MIGRATION_INVENTORY.md).

## Remote / prod cutover

Projects that already applied the old 20 migrations **cannot** simply switch to `init_schema` on the same database — migration versions will conflict. Options:

- **New project or full reset** — use init migration + seed (or prod seed policy).
- **Existing prod** — stay on old history until a deliberate rebuild, or squash only on a brand-new Supabase project.

## Related

- Smoke checklist: [`SMOKE.md`](./SMOKE.md)
- Seed config: `supabase/config.toml` → `[db.seed]`
