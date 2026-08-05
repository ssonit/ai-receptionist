/**
 * Direct Postgres access for db-integration tests that need to bypass
 * GoTrue's Admin API and write straight to `auth.users`.
 *
 * Why this exists: `admin.auth.admin.createUser({ app_metadata: {...} })`
 * always INSERTs the row with `raw_app_meta_data = {"provider":"email",...}`
 * first (since `email` is required on every admin createUser call), then
 * patches the caller's custom `app_metadata` via a *separate* UPDATE inside
 * the same request. An `after insert on auth.users` trigger — like
 * `handle_new_user()` — only ever sees the INSERT-time value, never the
 * later UPDATE (documented upstream: supabase/auth#975, supabase/auth#1280).
 * A real external-provider (Google) signup does not have this problem in
 * production: GoTrue sets `AppMetaData` on the user model before the single
 * INSERT for that code path. Inserting directly here reproduces that shape
 * for tests, without touching the Admin API's two-phase insert/update.
 */
import { Pool } from "pg";

/**
 * Fixed local Supabase CLI defaults (user/password are always "postgres";
 * port comes from supabase/config.toml's [db] port). Matches the hardcoded
 * NEXT_PUBLIC_SUPABASE_URL convention already used in vitest.config.mts —
 * shelling out to `npx supabase status` here would add several seconds of
 * subprocess overhead to the first test that opens a connection.
 */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: LOCAL_DB_URL, max: 2 });
  }
  return pool;
}

/**
 * Inserts a minimal, valid `auth.users` row with `raw_app_meta_data` already
 * set as given, so the `after insert on auth.users` trigger sees it. Returns
 * the new user's id.
 */
export async function insertAuthUserRaw(params: {
  email: string;
  appMetaData: Record<string, unknown>;
  userMetaData?: Record<string, unknown>;
}): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       is_sso_user, is_anonymous, created_at, updated_at
     ) values (
       '00000000-0000-0000-0000-000000000000',
       gen_random_uuid(), 'authenticated', 'authenticated', $1, '',
       now(), $2::jsonb, $3::jsonb,
       false, false, now(), now()
     )
     returning id`,
    [params.email, JSON.stringify(params.appMetaData), JSON.stringify(params.userMetaData ?? {})],
  );
  return rows[0].id;
}

/** Call once in an `afterAll` so vitest doesn't hang on an open pg pool. */
export async function closeRawPgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
