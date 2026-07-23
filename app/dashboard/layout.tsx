import { DashboardBookingPathProvider } from "@/components/dashboard-booking-path-context";
import { getDashboardUser } from "@/lib/dashboard-user";
import { redirect } from "next/navigation";

/** Auth gate only — setup completion is enforced in middleware. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard");
  }
  return (
    <DashboardBookingPathProvider value={dashboard.bookingPagePath}>
      {children}
    </DashboardBookingPathProvider>
  );
}
