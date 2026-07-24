import { NotificationsInbox } from "@/components/notifications-inbox";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { ensureDigestNotifications } from "@/lib/notification-digests";
import { listNotifications } from "@/lib/notifications";
import { redirect } from "next/navigation";

export default async function NotificationsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/notifications");
  }

  if (dashboard.workspaceId) {
    await ensureDigestNotifications(dashboard.workspaceId).catch(() => undefined);
  }
  const page = await listNotifications({
    unreadOnly: true,
    limit: 30,
  }).catch(() => ({ items: [], nextCursor: null }));

  return (
    <DashboardShell title="Notifications" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            New/urgent/overdue leads, chat bookings or Cal.com reschedule/cancel,
            AI tool errors, and missing agent config. Mark as read once handled.
          </p>
        </div>
        <NotificationsInbox
          initialItems={page.items}
          initialNextCursor={page.nextCursor}
        />
      </div>
    </DashboardShell>
  );
}
