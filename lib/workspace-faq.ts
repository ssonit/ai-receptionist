import { bookingConfig } from "./booking-config";
import { createAdminClient } from "./supabase/admin";
import { getPilotWorkspaceId } from "./workspace";

type WorkspaceFaqRow = {
  opening_hours: string | null;
  services: string | null;
  pricing: string | null;
  preparation: string | null;
  cancel_policy: string | null;
  extra: string | null;
};

export type WorkspaceFaqRecord = {
  workspaceId: string;
  name: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  openingHours: string | null;
  services: string | null;
  pricing: string | null;
  preparation: string | null;
  cancelPolicy: string | null;
  extra: string | null;
};

const UNCONFIGURED =
  "*(chưa cấu hình — chạy `npx supabase db reset` hoặc sửa bảng `workspace_faq` trên Supabase)*";

function contactLine(label: string, value: string | null | undefined): string {
  const v = value?.trim() ?? "";
  return v ? `- **${label}:** ${v}` : `- **${label}:** ${UNCONFIGURED}`;
}

function sectionOrPlaceholder(value: string | null | undefined): string {
  return value?.trim() || UNCONFIGURED;
}

function hasStructuredSections(faq: WorkspaceFaqRow | null | undefined): boolean {
  if (!faq) return false;
  return Boolean(
    faq.opening_hours?.trim() ||
      faq.services?.trim() ||
      faq.pricing?.trim() ||
      faq.preparation?.trim() ||
      faq.cancel_policy?.trim(),
  );
}

function mapRecord(
  workspace: {
    id: string;
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    workspace_faq: WorkspaceFaqRow | WorkspaceFaqRow[] | null;
  },
): WorkspaceFaqRecord {
  const faq = Array.isArray(workspace.workspace_faq)
    ? (workspace.workspace_faq[0] ?? null)
    : workspace.workspace_faq;

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    timezone: workspace.timezone,
    phone: workspace.phone,
    address: workspace.address,
    openingHours: faq?.opening_hours ?? null,
    services: faq?.services ?? null,
    pricing: faq?.pricing ?? null,
    preparation: faq?.preparation ?? null,
    cancelPolicy: faq?.cancel_policy ?? null,
    extra: faq?.extra ?? null,
  };
}

/** Load workspace + FAQ from Supabase (service role). Returns null if DB unavailable. */
export async function fetchWorkspaceFaq(): Promise<WorkspaceFaqRecord | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select(
        "id, name, timezone, phone, address, workspace_faq(opening_hours, services, pricing, preparation, cancel_policy, extra)",
      )
      .eq("id", getPilotWorkspaceId())
      .maybeSingle();

    if (error || !data) return null;
    return mapRecord(data);
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

  const hoursFirst =
    row.openingHours
      ?.split("\n")
      .find((l) => l.trim().startsWith("-"))
      ?.trim() ?? row.openingHours?.split("\n")[0]?.trim();

  return [
    contactLine("Workspace", row.name),
    contactLine("Timezone", row.timezone),
    contactLine("SĐT", row.phone),
    contactLine("Địa chỉ", row.address),
    `- **Giờ mở cửa (tóm tắt):** ${hoursFirst ?? UNCONFIGURED}`,
    `- **Đặt trước tối thiểu:** ${bookingConfig.minNoticeHours} giờ`,
    `- **Nguồn FAQ:** Supabase \`workspace_faq\``,
    `- **Chi tiết:** \`load_skill\` → \`booking_faq\``,
  ].join("\n");
}

/** Full FAQ markdown for booking_faq skill. */
export function buildBookingFaqMarkdown(row: WorkspaceFaqRecord | null): string {
  if (!row) {
    return `# Booking FAQ\n\n${UNCONFIGURED}\n\nChạy \`npx supabase db reset\` để nạp seed FAQ, hoặc chỉnh bảng \`workspace_faq\` trên Supabase Studio.`;
  }

  const faqRow: WorkspaceFaqRow = {
    opening_hours: row.openingHours,
    services: row.services,
    pricing: row.pricing,
    preparation: row.preparation,
    cancel_policy: row.cancelPolicy,
    extra: row.extra,
  };

  if (row.extra?.trim() && !hasStructuredSections(faqRow)) {
    return row.extra.trim();
  }

  const body = [
    `# Booking FAQ — ${row.name}`,
    "",
    `**Timezone:** ${row.timezone}`,
    contactLine("SĐT", row.phone),
    contactLine("Địa chỉ", row.address),
    "",
    "## Giờ mở cửa",
    sectionOrPlaceholder(row.openingHours),
    "",
    "## Dịch vụ phổ biến",
    sectionOrPlaceholder(row.services),
    "",
    "## Giá (tham khảo)",
    sectionOrPlaceholder(row.pricing),
    "",
    "## Đặt lịch",
    sectionOrPlaceholder(row.preparation),
    "",
    "## Hủy / đổi lịch",
    sectionOrPlaceholder(row.cancelPolicy),
  ];

  if (row.extra?.trim()) {
    body.push("", "## Thêm", row.extra.trim());
  }

  body.push(
    "",
    "Nếu thông tin FAQ không đủ, nói rõ bạn sẽ chuyển câu hỏi cho nhân viên và vẫn giúp đặt lịch.",
  );

  return body.join("\n");
}
