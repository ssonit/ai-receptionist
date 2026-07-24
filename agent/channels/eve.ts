import { eveChannel, defaultEveAuth } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";
import {
  EVE_CHAT_SESSION_HEADER,
  EVE_WORKSPACE_HEADER,
} from "@/lib/workspace";

type EveAuth = NonNullable<ReturnType<typeof defaultEveAuth>>;

/**
 * Stamp public-chat tenant headers onto whatever route auth produced
 * (OIDC / local-dev / anonymous). Needed so FAQ + tools resolve the right
 * workspace on turn 1 — before `eve_session_id` is linked in chat_sessions.
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
  if (!slug && !chatSessionId) return base;

  const attributes: Record<string, string | readonly string[]> = {
    ...base.attributes,
  };
  if (slug) attributes.workspaceSlug = slug;
  if (chatSessionId) attributes.chatSessionId = chatSessionId;

  return { ...base, attributes };
}

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Public visitor chat for the booking MVP (text agent).
    none(),
  ],
  onMessage: (ctx) => ({
    auth: withTenantAttributes(ctx.eve.request, defaultEveAuth(ctx)),
  }),
});
