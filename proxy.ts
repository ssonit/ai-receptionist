import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getBillingMode, isSubActive, type SubscriptionStatus } from "@/lib/billing";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { ROUTES, inviteRoute } from "@/lib/routes";
import { isPublicSignupOpen } from "@/lib/signup-mode";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/keys";
import { ensureVisitorIdOnResponse } from "@/lib/visitor";
import { isPilotBookingLive } from "@/lib/workspace";
import { WORKSPACE_ROLE } from "@/lib/workspace-roles";

/**
 * Server Actions + RSC soft navigations expect a Flight payload.
 * Redirecting them to HTML (setup ↔ dashboard) yields:
 * "An unexpected response was received from the server."
 */
function isNextFlightRequest(request: NextRequest): boolean {
  return (
    request.headers.has("next-action") ||
    request.headers.get("rsc") === "1" ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch")
  );
}

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
    path === ROUTES.CHAT ||
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

  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
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
    path.startsWith(DASHBOARD_PATH.root) || path.startsWith(ROUTES.CONSOLE);

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.LOGIN;
    redirectUrl.searchParams.set(
      "next",
      path.startsWith(ROUTES.CONSOLE) ? DASHBOARD_PATH.root : path,
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path.startsWith(DASHBOARD_PATH.root)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id, role, workspaces(setup_completed_at, cal_api_key_encrypted, cal_event_type_id, cal_auth_mode, plan_tier, subscription_status, trial_ends_at, billing_provider, period_ends_at)")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.workspace_id) {
      // PostgREST returns a single object for a many-to-one embed
      // (profiles.workspace_id → workspaces.id), but an array when the
      // relationship is inferred as to-many. Accept both.
      const wsRel = profile.workspaces as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
        | undefined;
      const ws = (Array.isArray(wsRel) ? wsRel[0] : wsRel) ?? undefined;

      const incomplete = !ws?.setup_completed_at;
      const onSetup = path === DASHBOARD_PATH.setup;
      const isOwner = profile.role === WORKSPACE_ROLE.OWNER;
      // Booking chỉ live khi có Cal key + meeting type AI. Giữ wizard mở
      // cho tới lúc đó, nếu không banner "Connect Cal.com" sẽ tự đá chính nó.
      const bookingLive = isPilotBookingLive({
        workspaceId: profile.workspace_id,
        hasEncryptedCalKey: Boolean(ws?.cal_api_key_encrypted),
        calEventTypeId: ws?.cal_event_type_id as number | null,
        calAuthMode: ws?.cal_auth_mode as string | null,
      });

      // Document navigations only — never redirect Flight/Action requests.
      // Setup wizard is owner-only; staff must not be forced into /dashboard/setup
      // (would bounce with assertOwnerPage → redirect loop).
      if (!isNextFlightRequest(request)) {
        if (incomplete && !onSetup && isOwner) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = DASHBOARD_PATH.setup;
          redirectUrl.search = "";
          return NextResponse.redirect(redirectUrl);
        }
        if (!incomplete && bookingLive && onSetup) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = DASHBOARD_PATH.root;
          redirectUrl.search = "";
          return NextResponse.redirect(redirectUrl);
        }

        // Subscription guard — redirect to billing if trial expired + no active sub.
        // Skip for billing page itself and setup wizard. Owner-only; staff always pass.
        if (
          !incomplete &&
          isOwner &&
          getBillingMode() !== "test" &&
          !path.startsWith(DASHBOARD_PATH.billing)
        ) {
          const subActive = isSubActive({
            planTier: (ws?.plan_tier as "free" | "starter" | "pro") ?? "free",
            subscriptionStatus: (ws?.subscription_status as SubscriptionStatus | null) ?? null,
            billingProvider: (ws?.billing_provider as "polar" | "sepay" | null) ?? null,
            billingCustomerId: null,
            billingSubscriptionId: null,
            periodEndsAt: (ws?.period_ends_at as string | null) ?? null,
            trialEndsAt: (ws?.trial_ends_at as string | null) ?? null,
          });
          if (!subActive) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = DASHBOARD_PATH.billing;
            redirectUrl.search = "";
            return NextResponse.redirect(redirectUrl);
          }
        }
      }
    }
  }

  if (path === ROUTES.SIGNUP && !isPublicSignupOpen()) {
    const invite = request.nextUrl.searchParams.get("invite")?.trim();
    if (!invite) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.LOGIN;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // /auth/callback sends OAuth failures to /login?error=… while the Google
  // session already exists (e.g. invalid invite). Bouncing that to the dashboard
  // would swallow the alert, so let an authenticated user render /login here.
  const showsLoginError =
    path === ROUTES.LOGIN &&
    Boolean(request.nextUrl.searchParams.get("error")?.trim());

  if (
    (path === ROUTES.LOGIN || path === ROUTES.SIGNUP) &&
    user &&
    !showsLoginError
  ) {
    const next = request.nextUrl.searchParams.get("next");
    const invite = request.nextUrl.searchParams.get("invite");
    const redirectUrl = request.nextUrl.clone();
    if (next?.startsWith("/")) {
      redirectUrl.pathname = next;
      redirectUrl.search = "";
    } else if (path === ROUTES.SIGNUP && invite?.trim()) {
      redirectUrl.pathname = inviteRoute(encodeURIComponent(invite.trim()));
      redirectUrl.search = "";
    } else {
      redirectUrl.pathname = DASHBOARD_PATH.root;
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
