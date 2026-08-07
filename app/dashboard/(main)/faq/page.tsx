import { FaqSettingsForm } from "@/app/_components/faq-settings-form";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { buildBookingFaqMarkdown } from "@/lib/workspace-faq";
import { fetchWorkspaceFaqForUser } from "@/lib/workspace-faq-server";

export default async function FaqPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.faq);

  const faq = dashboard.workspaceId
    ? await fetchWorkspaceFaqForUser(dashboard.workspaceId)
    : null;

  const previewMarkdown = buildBookingFaqMarkdown(faq);

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage Q&A for the agent. Workspace contact is in{" "}
          <a
            className="underline underline-offset-4"
            href={DASHBOARD_PATH.settings}
          >
            Settings
          </a>
          ; greeting and persona are under{" "}
          <a
            className="underline underline-offset-4"
            href={DASHBOARD_PATH.agent}
          >
            AI Agent
          </a>
          .
        </p>
      </div>
      <FaqSettingsForm faq={faq} previewMarkdown={previewMarkdown} />
    </div>
  );
}
