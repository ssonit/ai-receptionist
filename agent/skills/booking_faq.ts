import { defineDynamic, defineSkill } from "eve/skills";
import {
  buildBookingFaqMarkdown,
  fetchWorkspaceFaq,
} from "../../lib/workspace-faq";
import { resolveWorkspaceIdFromAgentContext } from "../../lib/workspace";

const description =
  "Use for booking FAQ — workspace contact info and Q&A items (hours, services, pricing, policies, etc.).";

async function faqSkill(ctx: {
  session?: {
    id?: string;
    auth?: {
      current?: { attributes?: Readonly<Record<string, string | readonly string[]>> } | null;
      initiator?: { attributes?: Readonly<Record<string, string | readonly string[]>> } | null;
    };
  };
}) {
  console.error(`[diag] faqSkill enter ${Date.now()}`);
  const workspaceId = await resolveWorkspaceIdFromAgentContext({
    sessionId: ctx.session?.id ?? null,
    auth: ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null,
  });
  const workspace = await fetchWorkspaceFaq(workspaceId);
  console.error(`[diag] faqSkill after fetchWorkspaceFaq ${Date.now()}`);
  return defineSkill({
    description,
    markdown: buildBookingFaqMarkdown(workspace),
  });
}

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => faqSkill(ctx),
    "turn.started": async (_event, ctx) => faqSkill(ctx),
  },
});
