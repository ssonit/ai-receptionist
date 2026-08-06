/**
 * Resolve Supabase URL + API keys from the active env (cloud-first).
 *
 * Canonical names (Dashboard / new CLI):
 * - NEXT_PUBLIC_SUPABASE_URL (fallback: SUPABASE_URL)
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (fallback: SUPABASE_PUBLISHABLE_KEY)
 * - SUPABASE_SECRET_KEY
 *
 * Legacy aliases (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
 * remain as last-resort fallbacks so older shells / CI keep working until removed.
 */

function trimEnv(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

export function getSupabaseUrl(): string | undefined {
  return (
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    trimEnv(process.env.SUPABASE_URL)
  );
}

/** Publishable / anon key for browser + cookie-bound server clients. */
export function getSupabasePublishableKey(): string | undefined {
  return (
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    trimEnv(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/** Secret / service-role key for admin clients and secret fallbacks. */
export function getSupabaseSecretKey(): string | undefined {
  return (
    trimEnv(process.env.SUPABASE_SECRET_KEY) ||
    trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
