import { FaqSettingsForm } from "@/app/_components/faq-settings-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { buildBookingFaqMarkdown } from "@/lib/workspace-faq";
import { fetchWorkspaceFaqForUser } from "@/lib/workspace-faq-server";
import { redirect } from "next/navigation";

export default async function FaqPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/faq");
  }

  const faq = dashboard.workspaceId
    ? await fetchWorkspaceFaqForUser(dashboard.workspaceId)
    : null;

  const previewMarkdown = buildBookingFaqMarkdown(faq);

  return (
    <DashboardShell title="FAQ" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage Q&A for the agent. Workspace contact is in{" "}
            <a className="underline underline-offset-4" href="/dashboard/settings">
              Settings
            </a>
            ; greeting and persona are under{" "}
            <a className="underline underline-offset-4" href="/dashboard/agent">
              AI Agent
            </a>
            .
          </p>
        </div>
        <FaqSettingsForm faq={faq} previewMarkdown={previewMarkdown} />
      </div>
    </DashboardShell>
  );
}
