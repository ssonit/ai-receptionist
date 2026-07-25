import type { NextRequest, NextResponse } from "next/server";

export const VISITOR_COOKIE = "eve_visitor_id";
const MAX_AGE_SEC = 60 * 60 * 24 * 365;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVisitorId(value: string | undefined | null): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export function visitorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

/** Read visitor id from a NextRequest; return null if missing/invalid. */
export function readVisitorIdFromRequest(request: NextRequest): string | null {
  const raw = request.cookies.get(VISITOR_COOKIE)?.value;
  return isVisitorId(raw) ? raw : null;
}

/** Ensure request has a valid visitor cookie; mutates response when creating one. */
export function ensureVisitorIdOnResponse(
  request: NextRequest,
  response: NextResponse,
): string {
  const existing = readVisitorIdFromRequest(request);
  if (existing) {
    // Re-apply in case response was rebuilt (e.g. Supabase setAll).
    if (!response.cookies.get(VISITOR_COOKIE)?.value) {
      response.cookies.set(VISITOR_COOKIE, existing, visitorCookieOptions());
    }
    return existing;
  }
  const id = crypto.randomUUID();
  request.cookies.set(VISITOR_COOKIE, id);
  response.cookies.set(VISITOR_COOKIE, id, visitorCookieOptions());
  return id;
}
