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

  await ensureDigestNotifications().catch(() => undefined);
  const page = await listNotifications({
    unreadOnly: true,
    limit: 30,
  }).catch(() => ({ items: [], nextCursor: null }));

  return (
    <DashboardShell title="Notifications" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lead mới/gấp/quá hạn, booking qua chat hoặc đổi/hủy trên Cal.com,
            lỗi tool AI, và thiếu cấu hình agent. Đánh dấu đã đọc khi đã xử lý.
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
