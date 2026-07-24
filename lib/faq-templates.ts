import type { FaqItemInput } from "@/lib/workspace-faq-types";
import {
  DEFAULT_WORKSPACE_BUSINESS_HOURS,
  DEFAULT_WORKSPACE_SERVICES,
} from "@/lib/workspace-ai-defaults";

/** Workspace fields used to fill template answers when available. */
export type FaqTemplateContext = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  businessHours?: string | null;
  servicesSummary?: string | null;
  tagline?: string | null;
};

export type FaqTemplate = {
  id: string;
  /** Short label for suggestion chip. */
  label: string;
  question: string;
  /** Build answer from workspace profile; placeholders when blank. */
  answer: (ctx: FaqTemplateContext) => string;
};

function orPlaceholder(
  value: string | null | undefined,
  placeholder: string,
): string {
  const v = value?.trim();
  return v || placeholder;
}

/** VI-first chips — aligned with starter FAQ defaults. */
export const FAQ_TEMPLATES: readonly FaqTemplate[] = [
  {
    id: "hours",
    label: "Giờ mở cửa",
    question: "Giờ mở cửa?",
    answer: (ctx) =>
      orPlaceholder(ctx.businessHours, DEFAULT_WORKSPACE_BUSINESS_HOURS),
  },
  {
    id: "services",
    label: "Dịch vụ",
    question: "Có những dịch vụ nào?",
    answer: (ctx) =>
      orPlaceholder(ctx.servicesSummary, DEFAULT_WORKSPACE_SERVICES),
  },
  {
    id: "pricing",
    label: "Giá",
    question: "Giá tham khảo như thế nào?",
    answer: () =>
      [
        "- Tư vấn: theo bảng giá workspace",
        "- Không cam kết giá cuối qua chat nếu chưa xác nhận",
        "- Đặt consultation qua chat để được báo rõ hơn",
      ].join("\n"),
  },
  {
    id: "book",
    label: "Đặt lịch",
    question: "Đặt lịch như thế nào?",
    answer: (ctx) =>
      [
        `- Đặt qua chat${ctx.name?.trim() ? ` với ${ctx.name.trim()}` : ""} để xem lịch trống và xác nhận`,
        "- Bạn sẽ nhận thông tin xác nhận sau khi đặt",
        "- Đến trước giờ hẹn 10–15 phút nếu đến trực tiếp",
      ].join("\n"),
  },
  {
    id: "cancel",
    label: "Hủy / đổi",
    question: "Hủy hoặc đổi lịch thế nào?",
    answer: (ctx) => {
      const contact = ctx.phone?.trim() || ctx.email?.trim();
      return [
        "- Báo hủy/đổi trước ít nhất 4 giờ",
        contact
          ? `- Việc gấp: liên hệ ${contact}`
          : "- Việc gấp: liên hệ SĐT / email trong Settings",
        "- Có thể nhắn trong chat để được hỗ trợ",
      ].join("\n");
    },
  },
  {
    id: "location",
    label: "Địa chỉ",
    question: "Địa chỉ ở đâu?",
    answer: (ctx) => {
      const parts = [
        ctx.address?.trim(),
        ctx.website?.trim() ? `Website: ${ctx.website.trim()}` : null,
      ].filter(Boolean);
      if (parts.length > 0) return parts.map((p) => `- ${p}`).join("\n");
      return "- Thêm địa chỉ / website trong Settings để khách tìm được bạn";
    },
  },
] as const;

export function materializeFaqTemplate(
  template: FaqTemplate,
  ctx: FaqTemplateContext,
): FaqItemInput {
  return {
    question: template.question,
    answer: template.answer(ctx),
  };
}

export function faqTemplateContextFromWorkspace(
  faq: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    website?: string | null;
    businessHours?: string | null;
    servicesSummary?: string | null;
    tagline?: string | null;
  } | null,
): FaqTemplateContext {
  if (!faq) return {};
  return {
    name: faq.name,
    phone: faq.phone,
    email: faq.email,
    address: faq.address,
    website: faq.website,
    businessHours: faq.businessHours,
    servicesSummary: faq.servicesSummary,
    tagline: faq.tagline,
  };
}
