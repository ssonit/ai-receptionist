import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";

export type AnalyticsDayPoint = {
  date: string;
  bookings: number;
  leads: number;
  chatBookings: number;
};

export type LeadFunnelCount = Record<LeadStatus, number> & { total: number };

export type AnalyticsKpis = {
  bookingsInRange: number;
  leadsInRange: number;
  chatBookingsInRange: number;
  bookedLeadsInRange: number;
  conversionPct: number;
  cancelledBookingsInRange: number;
};

export type AiHealthAlert = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  href?: string;
};

export type ToolErrorRow = {
  id: string;
  tool_name: string;
  error: string | null;
  session_id: string | null;
  created_at: string;
};

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysInRange(days: number, end = new Date()): string[] {
  const endDay = startOfDay(end);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDay);
    d.setDate(endDay.getDate() - i);
    out.push(toYmd(d));
  }
  return out;
}

export function buildDailySeries(input: {
  days: number;
  bookings: { created_at: string; session_id: string | null }[];
  leads: { created_at: string }[];
  end?: Date;
}): AnalyticsDayPoint[] {
  const keys = daysInRange(input.days, input.end);
  const map = new Map<string, AnalyticsDayPoint>();
  for (const date of keys) {
    map.set(date, { date, bookings: 0, leads: 0, chatBookings: 0 });
  }

  for (const b of input.bookings) {
    const date = b.created_at.slice(0, 10);
    const row = map.get(date);
    if (!row) continue;
    row.bookings += 1;
    if (b.session_id) row.chatBookings += 1;
  }
  for (const l of input.leads) {
    const date = l.created_at.slice(0, 10);
    const row = map.get(date);
    if (!row) continue;
    row.leads += 1;
  }

  return keys.map((date) => map.get(date)!);
}

export function buildLeadFunnel(
  leads: { status: string }[],
): LeadFunnelCount {
  const funnel = {
    new: 0,
    contacted: 0,
    qualified: 0,
    booked: 0,
    lost: 0,
    total: leads.length,
  } satisfies LeadFunnelCount;

  for (const lead of leads) {
    if ((LEAD_STATUSES as readonly string[]).includes(lead.status)) {
      funnel[lead.status as LeadStatus] += 1;
    }
  }
  return funnel;
}

export function buildAnalyticsKpis(input: {
  bookings: { status: string; session_id: string | null }[];
  leads: { status: string }[];
}): AnalyticsKpis {
  const bookingsInRange = input.bookings.length;
  const leadsInRange = input.leads.length;
  const chatBookingsInRange = input.bookings.filter((b) => b.session_id).length;
  const bookedLeadsInRange = input.leads.filter((l) => l.status === "booked").length;
  const cancelledBookingsInRange = input.bookings.filter((b) => {
    const s = b.status.toLowerCase();
    return s === "cancelled" || s === "rejected" || s === "canceled";
  }).length;

  const conversionPct =
    leadsInRange > 0
      ? Math.round((bookedLeadsInRange / leadsInRange) * 100)
      : 0;

  return {
    bookingsInRange,
    leadsInRange,
    chatBookingsInRange,
    bookedLeadsInRange,
    conversionPct,
    cancelledBookingsInRange,
  };
}

export function buildAiHealthAlerts(input: {
  hasAiMeetingType: boolean;
  calUsername: string | null;
  faqCount: number;
  hasAbout: boolean;
  hasAgentInstructions: boolean;
  toolErrorsLast24h: number;
  staleNewLeads: number;
  leadsInRange: number;
  bookedLeadsInRange: number;
  chatBookingsInRange: number;
}): AiHealthAlert[] {
  const alerts: AiHealthAlert[] = [];

  if (!input.hasAiMeetingType) {
    alerts.push({
      id: "missing-ai-meeting-type",
      severity: "error",
      title: "Chưa chọn meeting type cho AI",
      detail:
        "Agent không check slot / đặt lịch được cho đến khi chọn type ở Settings.",
      href: "/dashboard/settings",
    });
  }

  if (!input.calUsername?.trim()) {
    alerts.push({
      id: "missing-cal-username",
      severity: "warning",
      title: "Chưa lấy được Cal.com username",
      detail:
        "Mở Meeting types để sync profile, hoặc kiểm tra CALCOM_API_KEY.",
      href: "/dashboard/meeting-types",
    });
  }

  if (input.faqCount === 0) {
    alerts.push({
      id: "empty-faq",
      severity: "warning",
      title: "FAQ trống",
      detail: "Agent thiếu Q&A — khách hỏi dịch vụ/giờ dễ bị trả lời generic.",
      href: "/dashboard/faq",
    });
  }

  if (!input.hasAbout || !input.hasAgentInstructions) {
    alerts.push({
      id: "thin-workspace-profile",
      severity: "info",
      title: "Hồ sơ AI chưa đầy đủ",
      detail: "Nên có Giới thiệu + Hướng dẫn agent ở Settings để trả lời ổn định hơn.",
      href: "/dashboard/settings",
    });
  }

  if (input.toolErrorsLast24h > 0) {
    alerts.push({
      id: "tool-errors",
      severity: "error",
      title: `${input.toolErrorsLast24h} lỗi tool trong 24h`,
      detail:
        "check_availability / book_appointment / log_lead đã fail — xem danh sách bên dưới.",
    });
  }

  if (input.staleNewLeads > 0) {
    alerts.push({
      id: "stale-leads",
      severity: "warning",
      title: `${input.staleNewLeads} lead new quá 3 ngày`,
      detail: "Nên chuyển contacted / lost hoặc gọi lại khách trên trang Leads.",
      href: "/dashboard/leads",
    });
  }

  if (
    input.leadsInRange >= 5 &&
    input.bookedLeadsInRange / Math.max(input.leadsInRange, 1) < 0.15
  ) {
    alerts.push({
      id: "low-conversion",
      severity: "warning",
      title: "Tỷ lệ lead → booked thấp",
      detail: "Dưới 15% trong khoảng đang xem — kiểm tra intake, notice, hoặc slot trống.",
      href: "/dashboard/leads",
    });
  }

  if (input.leadsInRange > 0 && input.chatBookingsInRange === 0) {
    alerts.push({
      id: "no-chat-bookings",
      severity: "info",
      title: "Có lead nhưng chưa có booking qua chat",
      detail: "Khách dừng ở intake — xem notes / urgency trên Leads.",
      href: "/dashboard/leads",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "healthy",
      severity: "info",
      title: "AI booking đang ổn",
      detail: "Không phát hiện lỗi cấu hình hoặc tool gần đây.",
    });
  }

  return alerts;
}
