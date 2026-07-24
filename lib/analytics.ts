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
      title: "AI meeting type not selected",
      detail:
        "The agent cannot check slots or book until you select a type in Settings.",
      href: "/dashboard/settings",
    });
  }

  if (!input.calUsername?.trim()) {
    alerts.push({
      id: "missing-cal-username",
      severity: "warning",
      title: "Cal.com username not available",
      detail:
        "Open Meeting types to sync the profile, or check CALCOM_API_KEY.",
      href: "/dashboard/meeting-types",
    });
  }

  if (input.faqCount === 0) {
    alerts.push({
      id: "empty-faq",
      severity: "warning",
      title: "FAQ is empty",
      detail: "Agent lacks Q&A — service/hours questions may get generic answers.",
      href: "/dashboard/faq",
    });
  }

  if (!input.hasAbout || !input.hasAgentInstructions) {
    alerts.push({
      id: "thin-workspace-profile",
      severity: "info",
      title: "AI profile incomplete",
      detail: "Add About + Agent instructions in Settings for more consistent answers.",
      href: "/dashboard/settings",
    });
  }

  if (input.toolErrorsLast24h > 0) {
    alerts.push({
      id: "tool-errors",
      severity: "error",
      title: `${input.toolErrorsLast24h} tool errors in 24h`,
      detail:
        "check_availability / book_appointment / log_lead failed — see the list below.",
    });
  }

  if (input.staleNewLeads > 0) {
    alerts.push({
      id: "stale-leads",
      severity: "warning",
      title: `${input.staleNewLeads} new leads older than 3 days`,
      detail: "Move to contacted / lost or follow up on the Leads page.",
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
      title: "Low lead → booked rate",
      detail: "Under 15% in the selected range — check intake, notices, or open slots.",
      href: "/dashboard/leads",
    });
  }

  if (input.leadsInRange > 0 && input.chatBookingsInRange === 0) {
    alerts.push({
      id: "no-chat-bookings",
      severity: "info",
      title: "Leads exist but no chat bookings yet",
      detail: "Customers stop at intake — review notes / urgency on Leads.",
      href: "/dashboard/leads",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "healthy",
      severity: "info",
      title: "AI booking looks healthy",
      detail: "No recent configuration or tool issues detected.",
    });
  }

  return alerts;
}
