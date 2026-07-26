/** Public origin for links in outbound email. */
export function appOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromEnv) {
    const withProto = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    return withProto.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
