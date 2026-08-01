import { defineChannel, POST, GET } from "eve/channels";
import {
  verifyMessengerSignature,
  parseMessengerEvent,
  verifyWebhookToken,
  type MessengerMessageEvent,
} from "@/lib/messenger-webhook";
import { sendMessengerText } from "@/lib/messenger";
import { getMessengerCredentialsForWorkspace } from "@/lib/workspace";
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

      const event = parseMessengerEvent(rawBody);
      if (!event || event.type !== "message") {
        return Response.json({ ok: true, skipped: true });
      }

      const msg = event as MessengerMessageEvent;

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

      // Double-check the page_id from the event matches the workspace.
      if (msg.pageId && creds.pageId && msg.pageId !== creds.pageId) {
        // Page mismatch — possibly a misconfigured webhook.
        return Response.json({ ok: true, skipped: true });
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
      const ip = args.requestIp ?? "0.0.0.0";
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
            "Bạn nhắn tin hơi nhanh. Đợi một chút rồi thử lại nhé.",
          );
        } catch {
          // Best-effort.
        }
        return Response.json({ ok: true, limited: true });
      }

      // Persist inbound message.
      await upsertChatMessages({
        sessionId: session.id,
        messages: [{ role: "user", content: msg.text }],
      });

      // Drive the agent in the background (Meta requires fast 200 OK).
      args.waitUntil(
        (async () => {
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
                  locale: "vi",
                  channel: "messenger",
                  externalUserId,
                },
              },
              continuationToken: `messenger:${workspaceId}:${externalUserId}`,
              title: msg.text.slice(0, 48),
            },
          );
          await touchChannelSession({
            id: session.id,
            eveSessionId: run.id,
          });
        })(),
      );

      return Response.json({ ok: true });
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

      // Send reply via Messenger.
      try {
        const creds = await getMessengerCredentialsForWorkspace(chat.workspace_id);
        await sendMessengerText(creds.pageAccessToken, chat.external_user_id, data.message);
      } catch {
        // Delivery failure — logged by runtime, don't throw into turn loop.
      }
    },
  },
});
