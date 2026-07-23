import {
  buildAiHealthAlerts,
  buildAnalyticsKpis,
  buildDailySeries,
  buildLeadFunnel,
  type AiHealthAlert,
  type AnalyticsDayPoint,
  type AnalyticsKpis,
  type LeadFunnelCount,
  type ToolErrorRow,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { getSessionWorkspaceId } from "@/lib/workspace-session";

const RANGE_DAYS = 30;
const SERIES_DAYS = 90;

export type AnalyticsDashboardData = {
  rangeDays: number;
  kpis: AnalyticsKpis;
  series90: AnalyticsDayPoint[];
  funnel: LeadFunnelCount;
  alerts: AiHealthAlert[];
  toolErrors: ToolErrorRow[];
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function loadAnalyticsDashboard(): Promise<AnalyticsDashboardData> {
  const supabase = await createClient();
  const workspaceId =
    (await getSessionWorkspaceId()) ?? getDefaultWorkspaceId();
  const rangeStart = daysAgoIso(RANGE_DAYS);
  const seriesStart = daysAgoIso(SERIES_DAYS);
  const day24h = daysAgoIso(1);
  const day3 = daysAgoIso(3);

  const [
    bookingsRangeRes,
    leadsRangeRes,
    bookingsSeriesRes,
    leadsSeriesRes,
    toolErrorsRes,
    toolErrorCountRes,
    staleLeadsRes,
    workspaceRes,
    aiMeetingTypeRes,
    faqCountRes,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("status, session_id, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", rangeStart),
    supabase
      .from("leads")
      .select("status, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", rangeStart),
    supabase
      .from("bookings")
      .select("created_at, session_id")
      .eq("workspace_id", workspaceId)
      .gte("created_at", seriesStart),
    supabase
      .from("leads")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", seriesStart),
    supabase
      .from("agent_tool_events")
      .select("id, tool_name, error, session_id, created_at")
      .eq("workspace_id", workspaceId)
      .eq("ok", false)
      .gte("created_at", day24h)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("agent_tool_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("ok", false)
      .gte("created_at", day24h),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "new")
      .lt("created_at", day3),
    supabase
      .from("workspaces")
      .select(
        "cal_username, about, agent_instructions, cal_event_type_id, cal_event_type_slug",
      )
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_event_types")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_ai_booking", true),
    supabase
      .from("workspace_faq_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
  ]);

  const bookingsRange = bookingsRangeRes.data ?? [];
  const leadsRange = leadsRangeRes.data ?? [];
  const kpis = buildAnalyticsKpis({
    bookings: bookingsRange,
    leads: leadsRange,
  });
  const funnel = buildLeadFunnel(leadsRange);
  const series90 = buildDailySeries({
    days: SERIES_DAYS,
    bookings: bookingsSeriesRes.data ?? [],
    leads: leadsSeriesRes.data ?? [],
  });

  const workspace = workspaceRes.data;
  const hasAiMeetingType = Boolean(
    (aiMeetingTypeRes.count ?? 0) > 0 ||
      workspace?.cal_event_type_id ||
      workspace?.cal_event_type_slug,
  );

  const toolEventsUnavailable = Boolean(
    toolErrorsRes.error || toolErrorCountRes.error,
  );
  const toolErrorsLast24h = toolEventsUnavailable
    ? 0
    : (toolErrorCountRes.count ?? 0);

  const alerts = buildAiHealthAlerts({
    hasAiMeetingType,
    calUsername: workspace?.cal_username ?? null,
    faqCount: faqCountRes.count ?? 0,
    hasAbout: Boolean(workspace?.about?.trim()),
    hasAgentInstructions: Boolean(workspace?.agent_instructions?.trim()),
    toolErrorsLast24h,
    staleNewLeads: staleLeadsRes.count ?? 0,
    leadsInRange: kpis.leadsInRange,
    bookedLeadsInRange: kpis.bookedLeadsInRange,
    chatBookingsInRange: kpis.chatBookingsInRange,
  });

  if (toolEventsUnavailable) {
    const withoutHealthy = alerts.filter((a) => a.id !== "healthy");
    withoutHealthy.unshift({
      id: "tool-events-missing",
      severity: "warning",
      title: "Chưa bật telemetry tool",
      detail:
        "Bảng agent_tool_events chưa có — chạy migration 20260723000006 rồi reload để theo dõi lỗi AI.",
    });
    return {
      rangeDays: RANGE_DAYS,
      kpis,
      series90,
      funnel,
      alerts: withoutHealthy,
      toolErrors: [],
    };
  }

  return {
    rangeDays: RANGE_DAYS,
    kpis,
    series90,
    funnel,
    alerts,
    toolErrors: (toolErrorsRes.data ?? []) as ToolErrorRow[],
  };
}
