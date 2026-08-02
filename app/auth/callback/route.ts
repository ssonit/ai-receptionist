import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? ROUTES.DASHBOARD;
  // Same guard as signIn/signOut; also reject protocol-relative "//evil.com".
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : ROUTES.DASHBOARD;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}${ROUTES.LOGIN}`);
}
