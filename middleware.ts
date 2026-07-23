import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureVisitorIdOnResponse } from "@/lib/visitor";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const needsVisitor =
    path === "/chat" ||
    path.startsWith("/chat/") ||
    path.startsWith("/api/chat/");

  if (needsVisitor) {
    ensureVisitorIdOnResponse(request, supabaseResponse);
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
  ],
};
