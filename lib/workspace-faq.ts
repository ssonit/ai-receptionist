import { bookingConfig } from "./booking-config";
import { createAdminClient } from "./supabase/admin";
import { getDefaultWorkspaceId } from "./workspace";
import {
  formatAiBookableMeetingTypeMarkdown,
  type AiBookingEventType,
} from "./workspace-cal";
import { mapWorkspaceFaqRecord } from "./workspace-faq-map";
import {
  WORKSPACE_FAQ_SELECT,
  type WorkspaceFaqQueryRow,
  type WorkspaceFaqRecord,
} from "./workspace-faq-types";

export type {
  FaqDraftItem,
  FaqItemInput,
  FaqSettingsFormProps,
  FaqSettingsState,
  WorkspaceFaqItem,
  WorkspaceFaqItemRow,
  WorkspaceFaqQueryRow,
  WorkspaceFaqRecord,
} from "./workspace-faq-types";

export { MAX_FAQ_ITEMS, WORKSPACE_FAQ_SELECT } from "./workspace-faq-types";
export { mapFaqItems, mapWorkspaceFaqRecord } from "./workspace-faq-map";

/** Product copy for missing fields — never mention db reset / seed. */
const NOT_SET = "Not set yet — fill in AI Agent / FAQ";
const AGENT_MISSING_HINT =
  "Do not invent missing details. Help with booking when possible, or offer to pass the question to staff.";

function contactLine(label: string, value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  return v ? `- **${label}:** ${v}` : null;
}

function blockSection(title: string, value: string | null | undefined): string[] {
  const v = value?.trim() ?? "";
  if (!v) return [];
  return [`## ${title}`, v, ""];
}

/** Load workspace + FAQ from Supabase (service role). Returns null if DB unavailable. */
export async function fetchWorkspaceFaq(
  workspaceId: string = getDefaultWorkspaceId(),
): Promise<WorkspaceFaqRecord | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select(WORKSPACE_FAQ_SELECT)
      .eq("id", workspaceId)
      .maybeSingle();

    if (error || !data) return null;
    return mapWorkspaceFaqRecord(data as WorkspaceFaqQueryRow);
  } catch {
    return null;
  }
}

function aiBookableSummaryLine(aiEvent: AiBookingEventType | null | undefined): string {
  if (!aiEvent) {
    return "- **AI bookable meeting type:** not configured";
  }
  const title = aiEvent.title.trim() || aiEvent.slug;
  return `- **AI bookable meeting type:** ${title} · ${aiEvent.lengthMinutes} phút (\`${aiEvent.slug}\`) — prefer this over FAQ duration`;
}

/** Short FAQ block for agent instructions. */
export function buildBookingFaqSummary(
  row: WorkspaceFaqRecord | null,
  aiEvent?: AiBookingEventType | null,
): string {
  if (!row) {
    return [
      aiBookableSummaryLine(aiEvent ?? null),
      `- **FAQ:** ${NOT_SET}`,
      `- **Minimum booking notice:** ${bookingConfig.minNoticeHours} hours (Cal.com)`,
      `- **Details:** \`load_skill\` → \`booking_faq\``,
      `- **Note:** ${AGENT_MISSING_HINT}`,
    ].join("\n");
  }

  const count = row.items.length;
  const firstQuestion = row.items[0]?.question?.trim();

  const lines = [
    contactLine("Workspace", row.name),
    contactLine("Tagline", row.tagline),
    contactLine("Timezone", row.timezone),
    contactLine("Phone", row.phone),
    contactLine("Email", row.email),
    contactLine("Website", row.website),
    contactLine("Address", row.address),
    aiBookableSummaryLine(aiEvent ?? null),
    row.businessHours?.trim()
      ? "- **Business hours:** configured"
      : null,
    row.servicesSummary?.trim() ? "- **Services:** configured" : null,
    row.agentInstructions?.trim()
      ? "- **Agent instructions:** configured"
      : null,
    row.agentDisplayName?.trim()
      ? `- **Agent name:** ${row.agentDisplayName.trim()}`
      : null,
    row.agentTone ? `- **Tone:** ${row.agentTone}` : null,
    row.agentReplyLocale && row.agentReplyLocale !== "auto"
      ? `- **Reply language preference:** ${row.agentReplyLocale}`
      : null,
    row.agentHandoff?.trim() ? "- **Handoff notes:** configured" : null,
    `- **FAQ:** ${
      count > 0
        ? `${count} items${firstQuestion ? ` (e.g. ${firstQuestion})` : ""}`
        : "none yet — owner should add Q&A on the FAQ page"
    }`,
    `- **Minimum booking notice:** ${bookingConfig.minNoticeHours} hours`,
    `- **Details:** \`load_skill\` → \`booking_faq\``,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

/** Full FAQ markdown for booking_faq skill. */
export function buildBookingFaqMarkdown(
  row: WorkspaceFaqRecord | null,
  aiEvent?: AiBookingEventType | null,
): string {
  const aiBlock = formatAiBookableMeetingTypeMarkdown(aiEvent ?? null);

  if (!row) {
    return [
      "# Booking FAQ",
      "",
      aiBlock.trimEnd(),
      "",
      NOT_SET,
      "",
      AGENT_MISSING_HINT,
    ].join("\n");
  }

  const contacts = [
    contactLine("Phone", row.phone),
    contactLine("Email", row.email),
    contactLine("Website", row.website),
    contactLine("Address", row.address),
  ].filter((line): line is string => Boolean(line));

  const body = [
    `# Booking FAQ — ${row.name}`,
    "",
    row.tagline?.trim() ? `> ${row.tagline.trim()}` : "",
    row.tagline?.trim() ? "" : "",
    `**Timezone:** ${row.timezone}`,
    ...contacts,
    contacts.length > 0 ? "" : "",
    aiBlock.trimEnd(),
    "",
    ...blockSection("About", row.about),
    ...blockSection("Business hours", row.businessHours),
    ...blockSection("Services", row.servicesSummary),
    ...blockSection("Agent instructions", row.agentInstructions),
    ...blockSection("Human handoff", row.agentHandoff),
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

  if (row.items.length === 0) {
    body.push(
      "## FAQ",
      "No Q&A items yet. Suggest the owner add FAQ on the dashboard, or help with booking and offer to pass other questions to staff.",
      "",
    );
  } else {
    body.push("## FAQ", "");
    for (const item of row.items) {
      body.push(`### ${item.question.trim()}`, item.answer.trim(), "");
    }
  }

  body.push(
    "If FAQ information is insufficient, say clearly that you will pass the question to staff and still help with booking.",
  );

  return body.join("\n");
}
