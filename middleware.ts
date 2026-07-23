import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureVisitorIdOnResponse } from "@/lib/visitor";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const bookingSlugMatch = path.match(/^\/b\/([^/]+)\/?$/);
  const bookingSlug = bookingSlugMatch?.[1]
    ? decodeURIComponent(bookingSlugMatch[1]).trim().toLowerCase()
    : null;

  const needsVisitor =
    path === "/chat" ||
    path.startsWith("/chat/") ||
    path.startsWith("/api/chat/") ||
    Boolean(bookingSlug);

  if (needsVisitor) {
    ensureVisitorIdOnResponse(request, supabaseResponse);
  }

  // Remember public chat tenant slug (?w= or /b/[slug])
  const w = request.nextUrl.searchParams.get("w")?.trim() || bookingSlug;
  if (needsVisitor && w) {
    supabaseResponse.cookies.set("eve_w", w.toLowerCase(), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        if (needsVisitor) {
          ensureVisitorIdOnResponse(request, supabaseResponse);
          if (w) {
            supabaseResponse.cookies.set("eve_w", w.toLowerCase(), {
              path: "/",
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 365,
            });
          }
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute =
    path.startsWith("/dashboard") || path.startsWith("/console");

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "next",
      path.startsWith("/console") ? "/dashboard" : path,
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.workspace_id) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("setup_completed_at")
        .eq("id", profile.workspace_id)
        .maybeSingle();

      const incomplete = !ws?.setup_completed_at;
      const onSetup = path === "/dashboard/setup";

      if (incomplete && !onSetup) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard/setup";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
      if (!incomplete && onSetup) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  if ((path === "/login" || path === "/signup") && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/console/:path*",
    "/login",
    "/signup",
    "/chat",
    "/chat/:path*",
    "/api/chat/:path*",
    "/b/:path*",
  ],
};
