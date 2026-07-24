import { bookingConfig } from "./booking-config";
import { createAdminClient } from "./supabase/admin";
import { getDefaultWorkspaceId } from "./workspace";
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

const UNCONFIGURED =
  "*(not configured — run `npx supabase db reset` or update in FAQ / Settings)*";

function contactLine(label: string, value: string | null | undefined): string {
  const v = value?.trim() ?? "";
  return v ? `- **${label}:** ${v}` : `- **${label}:** ${UNCONFIGURED}`;
}

function blockSection(title: string, value: string | null | undefined): string[] {
  const v = value?.trim() ?? "";
  if (!v) return [`## ${title}`, UNCONFIGURED, ""];
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

/** Short FAQ block for agent instructions. */
export function buildBookingFaqSummary(row: WorkspaceFaqRecord | null): string {
  if (!row) {
    return [
      `- **FAQ:** ${UNCONFIGURED}`,
      `- **Minimum booking notice:** ${bookingConfig.minNoticeHours} hours (Cal.com)`,
      `- **Details:** \`load_skill\` → \`booking_faq\``,
    ].join("\n");
  }

  const count = row.items.length;
  const firstQuestion = row.items[0]?.question?.trim();

  return [
    contactLine("Workspace", row.name),
    contactLine("Tagline", row.tagline),
    contactLine("Timezone", row.timezone),
    contactLine("Phone", row.phone),
    contactLine("Email", row.email),
    contactLine("Website", row.website),
    contactLine("Address", row.address),
    `- **Business hours:** ${row.businessHours?.trim() ? "configured" : UNCONFIGURED}`,
    `- **Services:** ${row.servicesSummary?.trim() ? "configured" : UNCONFIGURED}`,
    `- **Agent instructions:** ${row.agentInstructions?.trim() ? "configured" : UNCONFIGURED}`,
    `- **FAQ:** ${count > 0 ? `${count} items` : UNCONFIGURED}${
      firstQuestion ? ` (e.g. ${firstQuestion})` : ""
    }`,
    `- **Minimum booking notice:** ${bookingConfig.minNoticeHours} hours`,
    `- **Details:** \`load_skill\` → \`booking_faq\``,
  ].join("\n");
}

/** Full FAQ markdown for booking_faq skill. */
export function buildBookingFaqMarkdown(row: WorkspaceFaqRecord | null): string {
  if (!row) {
    return `# Booking FAQ\n\n${UNCONFIGURED}\n\nRun \`npx supabase db reset\` to load seed FAQ, or add FAQ on the FAQ page.`;
  }

  const body = [
    `# Booking FAQ — ${row.name}`,
    "",
    row.tagline?.trim() ? `> ${row.tagline.trim()}` : "",
    row.tagline?.trim() ? "" : "",
    `**Timezone:** ${row.timezone}`,
    contactLine("Phone", row.phone),
    contactLine("Email", row.email),
    contactLine("Website", row.website),
    contactLine("Address", row.address),
    "",
    ...blockSection("About", row.about),
    ...blockSection("Business hours", row.businessHours),
    ...blockSection("Services", row.servicesSummary),
    ...blockSection("Agent instructions", row.agentInstructions),
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

  if (row.items.length === 0) {
    body.push("## FAQ", UNCONFIGURED, "");
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
