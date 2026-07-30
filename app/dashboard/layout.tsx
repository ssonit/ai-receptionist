import { DashboardBookingPathProvider } from "@/components/dashboard-booking-path-context";
import { DashboardRoleProvider } from "@/components/dashboard-role-context";
import { LocaleProvider } from "@/components/locale-provider";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";
import { readDashboardLocale } from "@/lib/read-locale-cookie";
import { redirect } from "next/navigation";

/** Auth gate only — setup completion is enforced in proxy. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect(`/login?next=${DASHBOARD_PATH.root}`);
  }
  const initialLocale = await readDashboardLocale();
  return (
    <LocaleProvider initialLocale={initialLocale} kind="dashboard">
      <DashboardRoleProvider role={dashboard.role}>
        <DashboardBookingPathProvider value={dashboard.bookingPagePath}>
          {children}
        </DashboardBookingPathProvider>
      </DashboardRoleProvider>
    </LocaleProvider>
  );
}
