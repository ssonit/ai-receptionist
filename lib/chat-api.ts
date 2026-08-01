import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { channelVisitorId } from "@/lib/chat-sessions";
import { APP_ERROR_CODE, isAppError } from "@/lib/errors";
import { readVisitorIdFromCookieHeader } from "@/lib/request-cookies";
import { ensureVisitorId } from "@/lib/visitor-server";
import {
  assertWorkspaceSubscriptionActive,
  resolvePublicWorkspaceId,
} from "@/lib/workspace";

/**
 * Resolve the public-chat actor. Prefer the incoming Request cookie (what
 * proxy stamped) so route handlers do not mint a second visitor id when
 * `cookies()` lags the middleware request mutation.
 */
export async function getChatActor(request?: Request) {
  const fromHeader = request
    ? readVisitorIdFromCookieHeader(request.headers.get("cookie"))
    : null;
  const visitorId = fromHeader ?? (await ensureVisitorId());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { visitorId, userId: user?.id ?? null };
}

/**
 * Resolve tenant for public chat from ?w= or eve_w cookie.
 *
 * Also the subscription chokepoint for guest chat: every `app/api/chat/**`
 * route goes through here, so an unpaid workspace can't burn LLM turns — the
 * agent-tool gate alone would still let the conversation run.
 *
 * Pass `skipSubscriptionCheck` for privacy actions (e.g. "forget me") that a
 * guest must be able to run even when the business stopped paying.
 *
 * @throws AppError SUBSCRIPTION_INACTIVE
 */
export async function getChatWorkspaceId(
  request?: Request,
  options?: { skipSubscriptionCheck?: boolean },
): Promise<string> {
  let slug: string | null = null;
  if (request) {
    try {
      slug = new URL(request.url).searchParams.get("w");
    } catch {
      // ignore
    }
  }
  if (!slug) {
    const jar = await cookies();
    slug = jar.get("eve_w")?.value ?? null;
  }
  const workspaceId = await resolvePublicWorkspaceId(slug);
  if (!options?.skipSubscriptionCheck) {
    await assertWorkspaceSubscriptionActive(workspaceId);
  }
  return workspaceId;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Map a thrown chat error to a response. `AppError` messages are already
 * guest-safe copy; anything else is logged and replaced with `fallback` so a
 * raw provider/DB string never reaches the browser.
 */
export function chatErrorResponse(error: unknown, fallback: string) {
  if (isAppError(error, APP_ERROR_CODE.SUBSCRIPTION_INACTIVE)) {
    return jsonError(error.message, 402);
  }
  if (isAppError(error)) {
    return jsonError(error.message, 400);
  }
  console.error("[chat]", fallback, error);
  return jsonError(fallback, 500);
}

// ── Channel actor (non-browser, server-trusted) ──

export function getChannelActor(input: {
  channel: string;
  externalUserId: string;
  workspaceId: string;
}) {
  return {
    visitorId: channelVisitorId(input.channel, input.externalUserId),
    userId: null as string | null,
    workspaceId: input.workspaceId,
  };
}
