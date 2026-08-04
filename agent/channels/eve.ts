import { eveChannel, defaultEveAuth } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";
import {
  checkAgentRateLimit,
  clientIpFromRequest,
} from "@/lib/agent-rate-limit";
import { EVE_LOCALE_HEADER, EVE_TZ_HEADER, parseAppLocale } from "@/lib/locale";
import { readVisitorIdFromCookieHeader } from "@/lib/request-cookies";
import {
  EVE_CHAT_SESSION_HEADER,
  EVE_WORKSPACE_HEADER,
  resolveWorkspaceIdFromAgentContext,
} from "@/lib/workspace";
import { normalizeIanaTimeZone } from "@/lib/guest-timezone";

type EveAuth = NonNullable<ReturnType<typeof defaultEveAuth>>;

/**
 * Stamp public-chat tenant (+ locale + visitor + guest tz) headers onto whatever route
 * auth produced. Visitor binding (S1) prevents spoofing x-eve-chat-session.
 */
function withTenantAttributes(
  request: Request,
  base: EveAuth | null,
): EveAuth | null {
  if (!base) return null;

  const slug = request.headers.get(EVE_WORKSPACE_HEADER)?.trim().toLowerCase();
  const chatSessionId = request.headers
    .get(EVE_CHAT_SESSION_HEADER)
    ?.trim();
  const localeRaw = request.headers.get(EVE_LOCALE_HEADER)?.trim();
  const tzRaw = request.headers.get(EVE_TZ_HEADER)?.trim();
  const guestTimeZone = normalizeIanaTimeZone(tzRaw);
  const visitorId = readVisitorIdFromCookieHeader(
    request.headers.get("cookie"),
  );

  if (!slug && !chatSessionId && !localeRaw && !visitorId && !guestTimeZone) {
    return base;
  }

  const attributes: Record<string, string | readonly string[]> = {
    ...base.attributes,
  };
  if (slug) attributes.workspaceSlug = slug;
  if (chatSessionId) attributes.chatSessionId = chatSessionId;
  if (localeRaw) attributes.locale = parseAppLocale(localeRaw);
  if (visitorId) attributes.visitorId = visitorId;
  if (guestTimeZone) attributes.guestTimeZone = guestTimeZone;

  return { ...base, attributes };
}

/**
 * Is a staff member holding this conversation right now?
 *
 * `chatSessionId` arrives on a client-supplied header, so the session is read
 * through the resolved workspace (spec T6) — never a bare session-id lookup,
 * which would be an unowned read path into another tenant's conversation.
 *
 * A resolution failure is not this handler's to report: fall through as "not
 * human" and let the normal turn raise it where the guest gets a real error.
 */
async function isHumanReplyMode(
  base: EveAuth,
  chatSessionId: string,
): Promise<boolean> {
  try {
    const workspaceId = await resolveWorkspaceIdFromAgentContext({
      auth: base,
    });
    const { getWorkspaceChatSession } = await import("@/lib/chat-sessions");
    const session = await getWorkspaceChatSession(chatSessionId, workspaceId);
    return session?.reply_mode === "human";
  } catch (error) {
    console.error("[eve channel] reply mode check failed", error);
    return false;
  }
}

export default eveChannel({
  auth: [
    vercelOidc(),
    localDev(),
    none(),
  ],
  onMessage: async (ctx) => {
    const request = ctx.eve.request;
    console.error(`[diag] onMessage enter ${Date.now()}`);
    const visitorId = readVisitorIdFromCookieHeader(
      request.headers.get("cookie"),
    );
    const ip = clientIpFromRequest(request);
    const workspaceSlug = request.headers
      .get(EVE_WORKSPACE_HEADER)
      ?.trim()
      .toLowerCase();
    const base = withTenantAttributes(request, defaultEveAuth(ctx));
    const limited = await checkAgentRateLimit({ visitorId, ip, workspaceSlug });
    console.error(`[diag] onMessage after rateLimit ${Date.now()}`);
    if (!limited.ok) {
      // Soft-stamp so tools/instructions can surface a friendly limit message
      // while keeping tenant context for correct workspace resolution.
      return {
        auth: base
          ? {
              ...base,
              attributes: {
                ...base.attributes,
                agentRateLimited: "1",
              },
            }
          : null,
      };
    }

    // Going silent is not an option: the widget's idle watchdog
    // (app/_components/agent-chat.tsx) would fire and show the guest a
    // timeout error that is not real. So the turn runs, but held to one
    // sentence by both the context below and the prompt in instructions.ts.
    const chatSessionId = request.headers
      .get(EVE_CHAT_SESSION_HEADER)
      ?.trim();
    if (base && chatSessionId && (await isHumanReplyMode(base, chatSessionId))) {
      return {
        auth: {
          ...base,
          attributes: { ...base.attributes, replyModeHuman: "1" },
        },
        context: [
          "A human teammate is handling this conversation right now.",
          "Reply with exactly one short sentence telling the guest a team",
          "member will respond shortly. Do not answer their question, do not",
          "call any tool, and do not add anything else.",
        ],
      };
    }

    return { auth: base };
  },
});
