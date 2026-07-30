import {
  DEFAULT_WORKSPACE_BUSINESS_HOURS,
  DEFAULT_WORKSPACE_SERVICES,
} from "@/lib/workspace-ai-defaults";
import type { FaqItemInput } from "@/lib/workspace-faq-types";

/** Starter FAQ Q&A for new / empty workspaces (VI — matches Eve Pilot seed). */
export const DEFAULT_WORKSPACE_FAQ_ITEMS: readonly FaqItemInput[] = [
  {
    question: "Giờ mở cửa?",
    answer: DEFAULT_WORKSPACE_BUSINESS_HOURS,
  },
  {
    question: "Có những dịch vụ nào?",
    answer:
      "- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.\n- Dịch vụ dài hơn — nhân viên xếp lịch trên Cal.com",
  },
  {
    question: "Giá tham khảo như thế nào?",
    answer:
      "- Tư vấn / Consultation (30 phút): theo bảng giá workspace\n- Không cam kết giá cuối qua chat nếu chưa xác nhận\n- Có thể đặt lịch trực tiếp qua chat để được báo rõ hơn",
  },
  {
    question: "Đặt lịch như thế nào?",
    answer:
      "- Đặt qua chat; lịch ghi vào calendar\n- Đến trước giờ hẹn 10–15 phút",
  },
  {
    question: "Hủy hoặc đổi lịch thế nào?",
    answer:
      "- Báo hủy/đổi trước ít nhất 4 giờ\n- Liên hệ SĐT workspace nếu gấp\n- Có thể nhắn trong chat để được hỗ trợ",
  },
] as const;

/** Services line used in FAQ starter (slightly richer than AI Agent services summary). */
export const DEFAULT_FAQ_SERVICES_ANSWER =
  DEFAULT_WORKSPACE_FAQ_ITEMS[1]?.answer ?? DEFAULT_WORKSPACE_SERVICES;
