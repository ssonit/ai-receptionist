/**
 * Parse Cookie header for agent / edge contexts (no next/headers).
 */
import { isVisitorId, VISITOR_COOKIE } from "@/lib/visitor";

export function parseCookieHeader(
  cookieHeader: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader?.trim()) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/** Read eve_visitor_id from a Fetch API Request cookie header. */
export function readVisitorIdFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  const raw = parseCookieHeader(cookieHeader)[VISITOR_COOKIE];
  return isVisitorId(raw) ? raw : null;
}
