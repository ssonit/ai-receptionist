import { AiHealthPanel } from "@/components/ai-health-panel";
import { AnalyticsTrendChart } from "@/components/analytics-trend-chart";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionCards, type SectionCardStat } from "@/components/section-cards";
import { loadAnalyticsDashboard } from "@/lib/analytics-data";
import { getDashboardUser } from "@/lib/dashboard-user";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/analytics");
  }

  const data = await loadAnalyticsDashboard();
  const { kpis, rangeDays } = data;

  const stats: SectionCardStat[] = [
    {
      label: `Bookings (${rangeDays}d)`,
      value: String(kpis.bookingsInRange),
      delta: `${kpis.chatBookingsInRange} qua chat`,
      trend: kpis.bookingsInRange > 0 ? "up" : "down",
      footnote: "Booking mới trong khoảng",
      detail: "Mirrored từ Cal.com / agent",
    },
    {
      label: `Leads (${rangeDays}d)`,
      value: String(kpis.leadsInRange),
      delta: `${kpis.bookedLeadsInRange} booked`,
      trend: kpis.leadsInRange > 0 ? "up" : "down",
      footnote: "Lead từ log_lead",
      detail: "Xem funnel bên dưới",
    },
    {
      label: "Lead → booked",
      value: `${kpis.conversionPct}%`,
      delta:
        kpis.conversionPct >= 15
          ? "Ổn"
          : kpis.leadsInRange >= 5
            ? "Thấp"
            : "Ít data",
      trend: kpis.conversionPct >= 15 ? "up" : "down",
      footnote: "Tỷ lệ chuyển đổi lead",
      detail: "booked / tổng lead trong khoảng",
    },
    {
      label: "Cancelled",
      value: String(kpis.cancelledBookingsInRange),
      delta: kpis.cancelledBookingsInRange ? "Cần xem" : "OK",
      trend: kpis.cancelledBookingsInRange ? "down" : "up",
      footnote: "Booking hủy trong khoảng",
      detail: "status cancelled / rejected",
    },
  ];

  return (
    <DashboardShell title="Analytics" user={dashboard.navUser}>
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Funnel, trend thật, và AI health (cấu hình + lỗi tool). Overview
              dashboard giữ KPI nhanh trong ngày.
            </p>
          </div>
          <SectionCards stats={stats} />
          <div className="px-4 lg:px-6">
            <AnalyticsTrendChart series90={data.series90} />
          </div>
          <div className="px-4 lg:px-6">
            <AiHealthPanel
              alerts={data.alerts}
              toolErrors={data.toolErrors}
              funnel={data.funnel}
            />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
