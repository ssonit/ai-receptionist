/**
 * Escaping for PostgREST `ilike` / `like` filters.
 *
 * `_` and `%` are wildcards in SQL pattern matching, and `_` is ordinary in an
 * email local part. Passing user data straight into `.ilike()` therefore
 * silently widens the match: `john_doe@x.com` also matches `johnXdoe@x.com`.
 * Verified against Postgres:
 *
 *   select 'johnXdoe@x.com' ilike 'john_doe@x.com';  -- t
 *   select 'johnXdoe@x.com' ilike 'john\_doe@x.com'; -- f
 *   select 'john_doe@x.com' ilike 'john\_doe@x.com'; -- t
 */

/**
 * Escape SQL LIKE wildcards so the value matches literally.
 * Use for exact (case-insensitive) comparisons — not for substring search,
 * where the caller adds its own `%` around the escaped value.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** `%value%` with the value's own wildcards escaped — for substring search. */
export function containsLikePattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
