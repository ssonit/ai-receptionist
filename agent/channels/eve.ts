import { eveChannel, defaultEveAuth } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";
import {
  checkAgentRateLimit,
  clientIpFromRequest,
} from "@/lib/agent-rate-limit";
import { EVE_LOCALE_HEADER, parseAppLocale } from "@/lib/locale";
import { readVisitorIdFromCookieHeader } from "@/lib/request-cookies";
import {
  EVE_CHAT_SESSION_HEADER,
  EVE_WORKSPACE_HEADER,
} from "@/lib/workspace";

type EveAuth = NonNullable<ReturnType<typeof defaultEveAuth>>;

/**
 * Stamp public-chat tenant (+ locale + visitor) headers onto whatever route
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
  const visitorId = readVisitorIdFromCookieHeader(
    request.headers.get("cookie"),
  );

  if (!slug && !chatSessionId && !localeRaw && !visitorId) return base;

  const attributes: Record<string, string | readonly string[]> = {
    ...base.attributes,
  };
  if (slug) attributes.workspaceSlug = slug;
  if (chatSessionId) attributes.chatSessionId = chatSessionId;
  if (localeRaw) attributes.locale = parseAppLocale(localeRaw);
  if (visitorId) attributes.visitorId = visitorId;

  return { ...base, attributes };
}

export default eveChannel({
  auth: [
    vercelOidc(),
    localDev(),
    none(),
  ],
  onMessage: (ctx) => {
    const request = ctx.eve.request;
    const visitorId = readVisitorIdFromCookieHeader(
      request.headers.get("cookie"),
    );
    const ip = clientIpFromRequest(request);
    const limited = checkAgentRateLimit({ visitorId, ip });
    if (!limited.ok) {
      // Soft-stamp so tools/instructions can surface a friendly limit message.
      const base = defaultEveAuth(ctx);
      if (!base) return { auth: null };
      return {
        auth: {
          ...base,
          attributes: {
            ...base.attributes,
            agentRateLimited: "1",
            visitorId: visitorId ?? "",
          },
        },
      };
    }

    return {
      auth: withTenantAttributes(request, defaultEveAuth(ctx)),
    };
  },
});
