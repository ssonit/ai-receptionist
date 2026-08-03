import { defineChannel, GET, POST } from "eve/channels";
import {
  parseZaloEvents,
  type ZaloMessageEvent,
  verifyZaloSignature,
} from "@/lib/zalo-webhook";
import { sendZaloText } from "@/lib/zalo";
import { getChannelConnectionByExternalId } from "@/lib/channel-connections";
import {
  assertWorkspaceSubscriptionActive,
  getWorkspaceReplyLocale,
  getZaloCredentialsForWorkspace,
} from "@/lib/workspace";
import { createTranslator } from "@/lib/i18n";
import {
  channelVisitorId,
  chatMessageExists,
  findChatSessionByEveSessionId,
  getOrCreateChannelSession,
  touchChannelSession,
  upsertChatMessages,
} from "@/lib/chat-sessions";
import { checkAgentRateLimit } from "@/lib/agent-rate-limit";

function getAppId(): string {
  const id = process.env.ZALO_APP_ID?.trim();
  if (!id) throw new Error("ZALO_NOT_CONFIGURED");
  return id;
}

function getOaSecretKey(): string {
  const key = process.env.ZALO_OA_SECRET_KEY?.trim();
  if (!key) throw new Error("ZALO_NOT_CONFIGURED");
  return key;
}

export async function onMessageCompleted(
  data: {
    message: string | null;
    turnId: string;
    sequence: number;
    finishReason?: unknown;
  },
  _channel: unknown,
  ctx: { session: { id: string } },
): Promise<void> {
  if (!data.message?.trim()) return;

  const chat = await findChatSessionByEveSessionId(ctx.session.id);
  if (!chat?.external_user_id || !chat.workspace_id) return;

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

  try {
    const creds = await getZaloCredentialsForWorkspace(chat.workspace_id);
    await sendZaloText(creds.accessToken, chat.external_user_id, data.message);
  } catch (error) {
    console.error(`[zalo] reply delivery failed for workspace ${chat.workspace_id}`, error);
  }
}

const channel = defineChannel({
  routes: [
    // Mount under /zalo/* — share /webhook with Messenger and eve will route
    // every request to one channel only (Messenger wins alphabetically).
    GET("/zalo/webhook", async () => new Response("ok", { status: 200 })),

    POST("/zalo/webhook", async (req, args) => {
      const rawBody = await req.text();

      const sig = req.headers.get("x-zevent-signature");
      if (!verifyZaloSignature(rawBody, sig, getAppId(), getOaSecretKey())) {
        return new Response("invalid_signature", { status: 401 });
      }

      const events = parseZaloEvents(rawBody);
      if (events.length === 0) {
        return Response.json({ ok: true, skipped: true });
      }

      // The webhook URL is registered once per app and shared by every OA, so
      // the tenant comes from the payload. An unresolved OA is a failure — never
      // a fallback to another workspace.
      const conn = await getChannelConnectionByExternalId("zalo", events[0].oaId);
      if (!conn) return new Response("zalo_not_configured", { status: 404 });
      const workspaceId = conn.workspaceId;

      try {
        await assertWorkspaceSubscriptionActive(workspaceId);
      } catch {
        return Response.json({ ok: true, skipped: "subscription_inactive" });
      }

      const locale = await getWorkspaceReplyLocale(workspaceId);
      const t = createTranslator(locale);
      const ip = args.requestIp ?? "0.0.0.0";

      const handle = async (msg: ZaloMessageEvent) => {
        // A batch could in principle mix OAs; never cross the tenant boundary.
        if (msg.oaId !== conn.externalId) return;

        const visitorId = channelVisitorId("zalo", msg.userId);
        const session = await getOrCreateChannelSession({
          workspaceId,
          channel: "zalo",
          externalUserId: msg.userId,
          visitorId,
          title: msg.text.slice(0, 48),
        });

        // Zalo retries a webhook it thinks failed. Without this the guest is
        // answered twice and the workspace is billed two LLM turns.
        const inboundId = msg.msgId ? `zalo:${msg.msgId}` : "";
        if (inboundId && (await chatMessageExists(session.id, inboundId))) return;

        const limited = await checkAgentRateLimit({
          visitorId,
          ip,
          workspaceSlug: undefined,
        });

        if (!limited.ok) {
          try {
            const creds = await getZaloCredentialsForWorkspace(workspaceId);
            await sendZaloText(creds.accessToken, msg.userId, t("chat.rateLimited"));
          } catch (error) {
            console.error("[zalo] rate-limit notice failed", error);
          }
          return;
        }

        await upsertChatMessages({
          sessionId: session.id,
          messages: [
            {
              role: "user",
              content: msg.text,
              ...(inboundId ? { eve_message_id: inboundId } : {}),
            },
          ],
        });

        const run = await args.send(
          { message: msg.text },
          {
            auth: {
              authenticator: "zalo",
              principalType: "user",
              principalId: msg.userId,
              attributes: {
                chatSessionId: session.id,
                visitorId,
                locale,
                channel: "zalo",
                externalUserId: msg.userId,
              },
            },
            continuationToken: `zalo:${workspaceId}:${msg.userId}`,
            title: msg.text.slice(0, 48),
          },
        );
        await touchChannelSession({ id: session.id, eveSessionId: run.id });
      };

      // Drive the agent in the background — Zalo retries on a slow response.
      // Sequential so two messages from one guest keep their order.
      args.waitUntil(
        (async () => {
          for (const msg of events) {
            try {
              await handle(msg);
            } catch (error) {
              console.error("[zalo] failed to handle message", msg.msgId, error);
            }
          }
        })(),
      );

      return Response.json({ ok: true, received: events.length });
    }),
  ],

  events: {
    "message.completed": onMessageCompleted,
  },
});

export default channel;

