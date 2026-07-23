# Archived incremental migrations

These 20 files were the original incremental path (`20260722*` → `20260723000012`).
They were consolidated into a single active migration:

- [`../migrations/20260724000001_init_schema.sql`](../migrations/20260724000001_init_schema.sql)

**Do not re-apply** these on a fresh database. Kept for history and diff reference only.

If a remote Supabase project still has the old migration history in `supabase_migrations.schema_migrations`, either:

- reset/rebuild that project from scratch with the new init migration, or
- leave that environment on the old history until a planned cutover (do not mix both paths on one DB).
