import { LeadsTable } from "@/components/leads-table";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LeadsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/leads");
  }

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) {
    redirect("/dashboard/setup");
  }

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, full_name, phone, email, service, urgency, notes, status, session_id, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <DashboardShell title="Leads" user={dashboard.navUser} workspaceId={dashboard.workspaceId}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Leads from the chat agent (`log_lead`). Update status when contacted or
            when the customer has booked.
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Long-treatment requests are logged immediately from chat and should be
            triaged first.
          </p>
        </div>
        <LeadsTable rows={leads ?? []} />
      </div>
    </DashboardShell>
  );
}
