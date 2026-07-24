import { ConversationsTable } from "@/components/conversations-table";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadConversationsDashboard } from "@/lib/conversations-dashboard";
import { getDashboardUser } from "@/lib/dashboard-user";
import { redirect } from "next/navigation";

export default async function ConversationsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/conversations");
  }

  const { rows } = await loadConversationsDashboard();

  return (
    <DashboardShell title="Conversations" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Saved chat conversations — review transcripts and outcomes (booked / lead /
            tool errors) to evaluate the AI.
          </p>
        </div>
        <ConversationsTable rows={rows} />
      </div>
    </DashboardShell>
  );
}
