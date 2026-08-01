import { defineChannel, POST, GET } from "eve/channels";
import {
  verifyMessengerSignature,
  parseMessengerEvents,
  verifyWebhookToken,
  type MessengerMessageEvent,
} from "@/lib/messenger-webhook";
import { sendMessengerText } from "@/lib/messenger";
import {
  assertWorkspaceSubscriptionActive,
  getMessengerCredentialsForWorkspace,
  getWorkspaceReplyLocale,
} from "@/lib/workspace";
import { createTranslator } from "@/lib/i18n";
import {
  getOrCreateChannelSession,
  channelVisitorId,
  upsertChatMessages,
  touchChannelSession,
  findChatSessionByEveSessionId,
} from "@/lib/chat-sessions";
import { checkAgentRateLimit } from "@/lib/agent-rate-limit";

function getAppSecret(): string {
  const s = process.env.META_APP_SECRET?.trim();
  if (!s) throw new Error("MESSENGER_NOT_CONFIGURED");
  return s;
}

function getVerifyToken(): string {
  const t = process.env.MESSENGER_VERIFY_TOKEN?.trim();
  if (!t) throw new Error("MESSENGER_NOT_CONFIGURED");
  return t;
}

/** Extract workspace_id from the webhook URL query string. */
function getWorkspaceIdFromUrl(req: Request): string | null {
  try {
    return new URL(req.url).searchParams.get("workspace_id")?.trim() || null;
  } catch {
    return null;
  }
}

export default defineChannel({
  routes: [
    // Meta webhook verification challenge (GET).
    GET("/webhook", async (req) => {
      const challenge = verifyWebhookToken(
        new URL(req.url).searchParams,
        getVerifyToken(),
      );
      if (!challenge) {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(challenge, {
        headers: { "Content-Type": "text/plain" },
      });
    }),

    // Inbound messages (POST).
    POST("/webhook", async (req, args) => {
      const rawBody = await req.text();

      // Verify HMAC.
      const sig = req.headers.get("x-hub-signature-256")?.trim() ?? "";
      if (!verifyMessengerSignature(rawBody, sig, getAppSecret())) {
        return new Response("invalid_signature", { status: 401 });
      }

      // Meta batches deliveries — one POST can carry several messages.
      const events = parseMessengerEvents(rawBody);
      if (events.length === 0) {
        return Response.json({ ok: true, skipped: true });
      }

      // Resolve workspace. URL pattern: /eve/v1/messenger/webhook?workspace_id=<id>
      const workspaceId = getWorkspaceIdFromUrl(req);
      if (!workspaceId) {
        return new Response("missing_workspace_id", { status: 400 });
      }

      let creds: { pageId: string; pageAccessToken: string };
      try {
        creds = await getMessengerCredentialsForWorkspace(workspaceId);
      } catch {
        return new Response("messenger_not_configured", { status: 404 });
      }

      // Same paywall as guest web chat — otherwise an unpaid workspace still
      // burns LLM turns through Messenger.
      try {
        await assertWorkspaceSubscriptionActive(workspaceId);
      } catch {
        return Response.json({ ok: true, skipped: "subscription_inactive" });
      }

      const locale = await getWorkspaceReplyLocale(workspaceId);
      const t = createTranslator(locale);
      const ip = args.requestIp ?? "0.0.0.0";

      const handle = async (msg: MessengerMessageEvent) => {
        // Double-check the page_id from the event matches the workspace.
        if (msg.pageId && creds.pageId && msg.pageId !== creds.pageId) {
          // Page mismatch — possibly a misconfigured webhook.
          return;
        }

        const externalUserId = msg.psid;
        const visitorId = channelVisitorId("messenger", externalUserId);

        // Find or create session.
        const session = await getOrCreateChannelSession({
          workspaceId,
          channel: "messenger",
          externalUserId,
          visitorId,
          title: msg.text.slice(0, 48),
        });

        // Rate limit.
        const limited = await checkAgentRateLimit({
          visitorId,
          ip,
          workspaceSlug: undefined,
        });

        if (!limited.ok) {
          try {
            await sendMessengerText(
              creds.pageAccessToken,
              externalUserId,
              t("chat.rateLimited"),
            );
          } catch (error) {
            console.error("[messenger] rate-limit notice failed", error);
          }
          return;
        }

        // Persist inbound message.
        await upsertChatMessages({
          sessionId: session.id,
          messages: [{ role: "user", content: msg.text }],
        });

        const run = await args.send(
          { message: msg.text },
          {
            auth: {
              authenticator: "messenger",
              principalType: "user",
              principalId: externalUserId,
              attributes: {
                chatSessionId: session.id,
                visitorId,
                locale,
                channel: "messenger",
                externalUserId,
              },
            },
            continuationToken: `messenger:${workspaceId}:${externalUserId}`,
            title: msg.text.slice(0, 48),
          },
        );
        await touchChannelSession({ id: session.id, eveSessionId: run.id });
      };

      // Drive the agent in the background (Meta requires fast 200 OK).
      // Sequential so two messages from the same guest keep their order.
      args.waitUntil(
        (async () => {
          for (const msg of events) {
            try {
              await handle(msg);
            } catch (error) {
              console.error("[messenger] failed to handle message", msg.mid, error);
            }
          }
        })(),
      );

      return Response.json({ ok: true, received: events.length });
    }),
  ],

  events: {
    async "message.completed"(data, _channel, ctx) {
      if (!data.message?.trim()) return;

      const chat = await findChatSessionByEveSessionId(ctx.session.id);
      if (!chat?.external_user_id || !chat.workspace_id) return;

      // Persist assistant reply.
      await upsertChatMessages({
        sessionId: chat.id,
        messages: [
          {
            role: "assistant",
            content: data.message,
            eve_message_id: `${data.turnId}:${data.sequence}`,
            raw: {
              turnId: data.turnId,
              sequence: data.sequence,
              finishReason: data.finishReason,
            },
          },
        ],
      });

      // Send reply via Messenger. Never throw into the turn loop, but do not
      // swallow silently either — a dropped reply is invisible to the guest.
      try {
        const creds = await getMessengerCredentialsForWorkspace(chat.workspace_id);
        await sendMessengerText(creds.pageAccessToken, chat.external_user_id, data.message);
      } catch (error) {
        console.error(
          `[messenger] reply delivery failed for workspace ${chat.workspace_id}`,
          error,
        );
      }
    },
  },
});
