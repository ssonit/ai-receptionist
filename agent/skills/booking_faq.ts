import { defineDynamic, defineSkill } from "eve/skills";
import {
  buildBookingFaqMarkdown,
  fetchWorkspaceFaq,
} from "../../lib/workspace-faq";

const description =
  "Use for booking FAQ — opening hours, address, phone, services, pricing, preparation, and policies.";

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
