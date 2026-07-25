import { cookies } from "next/headers";
import {
  isVisitorId,
  VISITOR_COOKIE,
  visitorCookieOptions,
} from "@/lib/visitor";

/** Server Components / Route Handlers via next/headers cookies(). */
export async function ensureVisitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (isVisitorId(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set(VISITOR_COOKIE, id, visitorCookieOptions());
  return id;
}

export async function getVisitorId(): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  return isVisitorId(existing) ? existing : null;
}
