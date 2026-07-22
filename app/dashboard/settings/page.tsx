import { FaqSettingsForm } from "@/app/_components/faq-settings-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { buildBookingFaqMarkdown } from "@/lib/workspace-faq";
import { fetchWorkspaceFaqForUser } from "@/lib/workspace-faq-server";
import { redirect } from "next/navigation";

export default async function FaqSettingsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/settings");
  }

  const faq = dashboard.workspaceId
    ? await fetchWorkspaceFaqForUser(dashboard.workspaceId)
    : null;

  const previewMarkdown = buildBookingFaqMarkdown(faq);

  return (
    <DashboardShell title="Cấu hình FAQ" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Chỉnh FAQ workspace để agent trả lời giờ mở cửa, dịch vụ, giá và chính sách đặt lịch.
            Không cần deploy lại — mỗi lượt chat sẽ load nội dung mới từ Supabase.
          </p>
        </div>
        <FaqSettingsForm faq={faq} previewMarkdown={previewMarkdown} />
      </div>
    </DashboardShell>
  );
}
