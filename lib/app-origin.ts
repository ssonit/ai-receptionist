import { headers } from "next/headers";

/** Sync public origin for links in outbound email / server jobs (env only). */
export function appOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromEnv) {
    const withProto = fromEnv.startsWith("http")
      ? fromEnv
      : `https://${fromEnv}`;
    return withProto.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

/**
 * Absolute origin for dashboard snippets and public URLs.
 * Prefers env (same as `appOrigin`), then request headers.
 */
export async function absoluteAppOrigin(): Promise<string> {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
