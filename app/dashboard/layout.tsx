import { DashboardBookingPathProvider } from "@/components/dashboard-booking-path-context";
import { LocaleProvider } from "@/components/locale-provider";
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
    redirect("/login?next=/dashboard");
  }
  const initialLocale = await readDashboardLocale();
  return (
    <LocaleProvider initialLocale={initialLocale} kind="dashboard">
      <DashboardBookingPathProvider value={dashboard.bookingPagePath}>
        {children}
      </DashboardBookingPathProvider>
    </LocaleProvider>
  );
}
