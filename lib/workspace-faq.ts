import { bookingConfig } from "./booking-config";
import { createAdminClient } from "./supabase/admin";
import { getPilotWorkspaceId } from "./workspace";
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
  "*(chưa cấu hình — chạy `npx supabase db reset` hoặc cập nhật ở FAQ / Settings)*";

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
export async function fetchWorkspaceFaq(): Promise<WorkspaceFaqRecord | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select(WORKSPACE_FAQ_SELECT)
      .eq("id", getPilotWorkspaceId())
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
      `- **Đặt trước tối thiểu:** ${bookingConfig.minNoticeHours} giờ (Cal.com)`,
      `- **Chi tiết:** \`load_skill\` → \`booking_faq\``,
    ].join("\n");
  }

  const count = row.items.length;
  const firstQuestion = row.items[0]?.question?.trim();

  return [
    contactLine("Workspace", row.name),
    contactLine("Tagline", row.tagline),
    contactLine("Timezone", row.timezone),
    contactLine("SĐT", row.phone),
    contactLine("Email", row.email),
    contactLine("Website", row.website),
    contactLine("Địa chỉ", row.address),
    `- **Giờ làm việc:** ${row.businessHours?.trim() ? "đã cấu hình" : UNCONFIGURED}`,
    `- **Dịch vụ:** ${row.servicesSummary?.trim() ? "đã cấu hình" : UNCONFIGURED}`,
    `- **Hướng dẫn agent:** ${row.agentInstructions?.trim() ? "đã cấu hình" : UNCONFIGURED}`,
    `- **FAQ:** ${count > 0 ? `${count} mục` : UNCONFIGURED}${
      firstQuestion ? ` (vd: ${firstQuestion})` : ""
    }`,
    `- **Đặt trước tối thiểu:** ${bookingConfig.minNoticeHours} giờ`,
    `- **Chi tiết:** \`load_skill\` → \`booking_faq\``,
  ].join("\n");
}

/** Full FAQ markdown for booking_faq skill. */
export function buildBookingFaqMarkdown(row: WorkspaceFaqRecord | null): string {
  if (!row) {
    return `# Booking FAQ\n\n${UNCONFIGURED}\n\nChạy \`npx supabase db reset\` để nạp seed FAQ, hoặc thêm FAQ ở trang FAQ.`;
  }

  const body = [
    `# Booking FAQ — ${row.name}`,
    "",
    row.tagline?.trim() ? `> ${row.tagline.trim()}` : "",
    row.tagline?.trim() ? "" : "",
    `**Timezone:** ${row.timezone}`,
    contactLine("SĐT", row.phone),
    contactLine("Email", row.email),
    contactLine("Website", row.website),
    contactLine("Địa chỉ", row.address),
    "",
    ...blockSection("Giới thiệu", row.about),
    ...blockSection("Giờ làm việc", row.businessHours),
    ...blockSection("Dịch vụ", row.servicesSummary),
    ...blockSection("Hướng dẫn cho agent", row.agentInstructions),
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
    "Nếu thông tin FAQ không đủ, nói rõ bạn sẽ chuyển câu hỏi cho nhân viên và vẫn giúp đặt lịch.",
  );

  return body.join("\n");
}
