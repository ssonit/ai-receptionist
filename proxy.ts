import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureVisitorIdOnResponse } from "@/lib/visitor";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const bookingSlugMatch = path.match(/^\/b\/([^/]+)\/?$/);
  const bookingSlug = bookingSlugMatch?.[1]
    ? decodeURIComponent(bookingSlugMatch[1]).trim().toLowerCase()
    : null;
  const embedSlugMatch = path.match(/^\/embed\/([^/]+)\/?$/);
  const embedSlug = embedSlugMatch?.[1]
    ? decodeURIComponent(embedSlugMatch[1]).trim().toLowerCase()
    : null;
  const isEmbed =
    Boolean(embedSlug) || path === "/embed" || path.startsWith("/embed/");

  const needsVisitor =
    path === "/chat" ||
    path.startsWith("/chat/") ||
    path.startsWith("/api/chat/") ||
    Boolean(bookingSlug) ||
    isEmbed;

  const visitorOpts = isEmbed ? { crossSite: true as const } : undefined;

  if (needsVisitor) {
    ensureVisitorIdOnResponse(request, supabaseResponse, visitorOpts);
  }

  // Remember public chat tenant slug (?w= or /b/[slug])
  const w =
    request.nextUrl.searchParams.get("w")?.trim() ||
    bookingSlug ||
    embedSlug;
  if (needsVisitor && w) {
    supabaseResponse.cookies.set("eve_w", w.toLowerCase(), {
      path: "/",
      sameSite: isEmbed ? "none" : "lax",
      secure: isEmbed || process.env.NODE_ENV === "production",
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
          ensureVisitorIdOnResponse(request, supabaseResponse, visitorOpts);
        }
        if (needsVisitor && w) {
          supabaseResponse.cookies.set("eve_w", w.toLowerCase(), {
            path: "/",
            sameSite: isEmbed ? "none" : "lax",
            secure: isEmbed || process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 365,
          });
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
    const next = request.nextUrl.searchParams.get("next");
    const invite = request.nextUrl.searchParams.get("invite");
    const redirectUrl = request.nextUrl.clone();
    if (next?.startsWith("/")) {
      redirectUrl.pathname = next;
      redirectUrl.search = "";
    } else if (path === "/signup" && invite?.trim()) {
      redirectUrl.pathname = `/invite/${encodeURIComponent(invite.trim())}`;
      redirectUrl.search = "";
    } else {
      redirectUrl.pathname = "/dashboard";
      redirectUrl.search = "";
    }
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
    "/invite/:path*",
    "/chat",
    "/chat/:path*",
    "/api/chat/:path*",
    "/b/:path*",
    "/embed",
    "/embed/:path*",
  ],
};
