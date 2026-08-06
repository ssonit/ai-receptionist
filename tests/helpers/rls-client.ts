/**
 * Run a query with RLS enforced, as a specific user.
 *
 * Why this exists: every db-integration test in this repo goes through
 * `createAdminClient()`, which uses the service-role key. Service role
 * BYPASSES row-level security entirely, so none of those tests can observe a
 * policy — they would pass identically with every policy dropped. Testing RLS
 * requires connecting as the non-superuser `authenticated` role with the JWT
 * claims that Supabase's `auth.uid()` reads.
 *
 * Everything runs inside a transaction that is always rolled back, so these
 * helpers never mutate state: use the admin client for setup, this for reads.
 */
import { getPool } from "./raw-pg";

type RunFn = <R = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<R[]>;

/**
 * Open one transaction as `userId` and run several statements inside it.
 *
 * Needed for testing the security definer RPCs: the transaction is rolled
 * back, so the only way to observe what an RPC wrote is to read it back
 * before the rollback, in the same transaction.
 */
export async function withUser<T>(
  userId: string,
  fn: (run: RunFn) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    // Order matters: set the claim while still superuser, then drop to the
    // `authenticated` role the policies are granted `to`. Doing it the other
    // way round can fail on permissions.
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");

    const run: RunFn = async (sql, params = []) => {
      const { rows } = await client.query(sql, params);
      return rows as never[];
    };

    return await fn(run);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Single-statement convenience wrapper over `withUser`. */
export async function queryAsUser<T = Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withUser(userId, (run) => run<T>(sql, params));
}
