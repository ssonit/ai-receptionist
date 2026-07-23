import { defineDynamic, defineSkill } from "eve/skills";
import {
  buildBookingFaqMarkdown,
  fetchWorkspaceFaq,
} from "../../lib/workspace-faq";

const description =
  "Use for booking FAQ — workspace contact info and Q&A items (hours, services, pricing, policies, etc.).";

async function faqSkill() {
  const workspace = await fetchWorkspaceFaq();
  return defineSkill({
    description,
    markdown: buildBookingFaqMarkdown(workspace),
  });
}

export default defineDynamic({
  events: {
    "session.started": async () => faqSkill(),
    "turn.started": async () => faqSkill(),
  },
});
