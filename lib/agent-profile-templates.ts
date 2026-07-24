import {
  DEFAULT_WORKSPACE_AGENT_INSTRUCTIONS,
  DEFAULT_WORKSPACE_ABOUT,
  DEFAULT_WORKSPACE_BUSINESS_HOURS,
  DEFAULT_WORKSPACE_SERVICES,
} from "@/lib/workspace-ai-defaults";

/** Starters for AI Agent persona fields (about / hours / instructions). */

export type AgentAboutTemplate = {
  id: string;
  label: string;
  about: string;
};

export type AgentHoursPreset = {
  id: string;
  label: string;
  hours: string;
};

export type AgentInstructionsStarter = {
  id: string;
  label: string;
  instructions: string;
};

export const AGENT_ABOUT_TEMPLATES: readonly AgentAboutTemplate[] = [
  {
    id: "default",
    label: "Mặc định Eve",
    about: DEFAULT_WORKSPACE_ABOUT,
  },
  {
    id: "clinic",
    label: "Phòng khám",
    about:
      "Chúng tôi là phòng khám gần bạn — hỗ trợ đặt tư vấn và tái khám. Khách hỏi giờ mở cửa, dịch vụ, lịch trống; tư vấn chuyên môn để đội ngũ chăm sóc xử lý.",
  },
  {
    id: "salon",
    label: "Salon / spa",
    about:
      "Chúng tôi nhận lịch làm đẹp và chăm sóc. Khách xem giờ mở cửa, dịch vụ và đặt lịch; chi tiết giá xác nhận khi chọn dịch vụ.",
  },
  {
    id: "coaching",
    label: "Coaching",
    about:
      "Chúng tôi tổ chức buổi coaching / tư vấn. Khách tìm hiểu dịch vụ, xem lịch trống và đặt cuộc gọi. Không đưa lời khuyên cá nhân hóa trước khi có lịch.",
  },
];

export const AGENT_HOURS_PRESETS: readonly AgentHoursPreset[] = [
  {
    id: "eve-default",
    label: "T2–T7 8–20",
    hours: DEFAULT_WORKSPACE_BUSINESS_HOURS,
  },
  {
    id: "weekdays-9-17",
    label: "T2–T6 9–17",
    hours: "- Thứ 2–Thứ 6: 09:00–17:00\n- Thứ 7–Chủ nhật: Nghỉ",
  },
  {
    id: "sat-morning",
    label: "T7 sáng",
    hours:
      "- Thứ 2–Thứ 6: 09:00–18:00\n- Thứ 7: 09:00–12:00\n- Chủ nhật: Nghỉ",
  },
];

export const AGENT_INSTRUCTIONS_STARTERS: readonly AgentInstructionsStarter[] =
  [
    {
      id: "eve-default",
      label: "Mặc định Eve",
      instructions: DEFAULT_WORKSPACE_AGENT_INSTRUCTIONS,
    },
    {
      id: "tone-booking",
      label: "Thân thiện + ưu tiên đặt lịch",
      instructions:
        "- Giọng ấm, ngắn gọn\n- Chỉ trong phạm vi booking / giờ / dịch vụ\n- Không bịa giá hoặc tư vấn chuyên môn\n- Khi khách muốn đến: đề nghị kiểm tra lịch trống",
    },
    {
      id: "handoff",
      label: "Chuyển người thật",
      instructions:
        "- Ngoài FAQ / đặt lịch: đề nghị gọi SĐT hoặc email workspace\n- Không hứa điều chưa xác nhận được\n- Trước khi book: xác nhận họ tên, SĐT, email",
    },
    {
      id: "strict",
      label: "Phạm vi chặt",
      instructions:
        "- Chỉ trả lời từ FAQ và hồ sơ workspace\n- Không chắc thì nói không chắc và gợi ý đặt consultation\n- Không giảm giá / cam kết trong chat",
    },
  ];

/** Optional: seed services chip from default summary lines. */
export const DEFAULT_SERVICE_SEED_LINES = DEFAULT_WORKSPACE_SERVICES;
