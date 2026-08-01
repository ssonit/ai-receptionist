import { CalConnectionCard } from "@/app/_components/cal-connection-card";
import { MessengerConnectionCard } from "@/app/_components/messenger-connection-card";
import { WorkspaceSettingsForm } from "@/app/_components/workspace-settings-form";
import { WebhookSecretCard } from "@/app/_components/webhook-secret-card";
import { WorkspaceTeamCard } from "@/app/_components/workspace-team-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { absoluteAppOrigin } from "@/lib/app-origin";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { WORKSPACE_ROLE } from "@/lib/workspace-roles";
import { createClient } from "@/lib/supabase/server";
import { publicBookingPath } from "@/lib/workspace";
import { WORKSPACE_AI_DEFAULTS } from "@/lib/workspace-ai-defaults";
import {
  listPendingInvites,
  listWorkspaceMembers,
} from "@/lib/workspace-invites";
import type { WorkspaceOpsValues } from "@/lib/workspace-settings-types";

export default async function SettingsPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.settings);

  let workspace: WorkspaceOpsValues | null = null;
  let calAuthModeForSettings: string | null = null;
  let calUsernameForSettings: string | null = null;
  let messengerPageId: string | null = null;
  let messengerPageName: string | null = null;
  let hasOwnWebhookSecret = false;
  let currentUserId: string | null = null;
  let members: Awaited<ReturnType<typeof listWorkspaceMembers>> = [];
  let pendingInvites: Awaited<ReturnType<typeof listPendingInvites>> = [];

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
    const { data } = await supabase
      .from("workspaces")
      .select(
        "name, slug, timezone, phone, address, email, website, tagline, guest_cancel_enabled, guest_reschedule_enabled, guest_change_cutoff_minutes, service_mode, booking_reminders_enabled, reminder_lead_minutes, reminder_quiet_start, reminder_quiet_end, cal_auth_mode, cal_username, messenger_page_id, messenger_page_name, webhook_secret_encrypted",
      )
      .eq("id", dashboard.workspaceId)
      .maybeSingle();

    if (data) {
      workspace = {
        name: data.name,
        slug: data.slug,
        timezone: data.timezone,
        phone: data.phone,
        address: data.address,
        email: data.email,
        website: data.website,
        tagline: data.tagline?.trim() || WORKSPACE_AI_DEFAULTS.tagline,
        guestCancelEnabled: data.guest_cancel_enabled !== false,
        guestRescheduleEnabled: data.guest_reschedule_enabled !== false,
        guestChangeCutoffMinutes:
          typeof data.guest_change_cutoff_minutes === "number"
            ? data.guest_change_cutoff_minutes
            : 120,
        serviceMode: data.service_mode === "online" ? "online" : "onsite",
        bookingRemindersEnabled: data.booking_reminders_enabled === true,
        reminderLeadMinutes: Array.isArray(data.reminder_lead_minutes)
          ? data.reminder_lead_minutes
          : [1440],
        reminderQuietStart:
          typeof data.reminder_quiet_start === "number"
            ? data.reminder_quiet_start
            : 21,
        reminderQuietEnd:
          typeof data.reminder_quiet_end === "number"
            ? data.reminder_quiet_end
            : 8,
      };
      calAuthModeForSettings =
        (data as Record<string, unknown>).cal_auth_mode as string | null;
      calUsernameForSettings =
        (data as Record<string, unknown>).cal_username as string | null;
      messengerPageId =
        (data as Record<string, unknown>).messenger_page_id as string | null;
      messengerPageName =
        (data as Record<string, unknown>).messenger_page_name as string | null;
      // Presence only — the ciphertext never leaves the server.
      hasOwnWebhookSecret = Boolean(
        (data as Record<string, unknown>).webhook_secret_encrypted,
      );
    }

    try {
      members = await listWorkspaceMembers(dashboard.workspaceId);
      if (dashboard.role === WORKSPACE_ROLE.OWNER) {
        pendingInvites = await listPendingInvites(dashboard.workspaceId);
      }
    } catch {
      members = [];
      pendingInvites = [];
    }
  }

  const origin = await absoluteAppOrigin();
  const publicBookingUrl = workspace?.slug
    ? `${origin}${publicBookingPath(workspace.slug)}`
    : null;

  return (
    <DashboardShell
      title="Settings"
      user={dashboard.navUser}
      workspaceId={dashboard.workspaceId}
    >
      <div className="py-4 md:py-6">
        <WorkspaceSettingsForm
          publicBookingUrl={publicBookingUrl}
          workspace={workspace}
        >
          {dashboard.workspaceId && dashboard.role ? (
            <WorkspaceTeamCard
              currentUserId={currentUserId ?? ""}
              inviteOrigin={origin}
              members={members}
              pendingInvites={pendingInvites}
              role={dashboard.role}
            />
          ) : null}
        </WorkspaceSettingsForm>

        {dashboard.workspaceId ? (
          <div className="mx-auto max-w-6xl px-4 pb-16 lg:px-6">
            <div className="border-t border-border/70 pt-8 lg:pt-10">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="space-y-1.5 lg:pt-0.5">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Cal.com
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                    Connect or disconnect your Cal.com calendar for booking.
                  </p>
                </div>
                <div className="min-w-0">
                  <CalConnectionCard
                    calAuthMode={calAuthModeForSettings}
                    calUsername={calUsernameForSettings}
                    workspaceId={dashboard.workspaceId}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/70 pt-8 lg:pt-10">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="space-y-1.5 lg:pt-0.5">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Messenger
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                    Connect your Facebook Page so guests can book via Messenger.
                  </p>
                </div>
                <div className="min-w-0">
                  <MessengerConnectionCard
                    workspaceId={dashboard.workspaceId}
                    messengerPageId={messengerPageId}
                    messengerPageName={messengerPageName}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/70 pt-8 lg:pt-10">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="space-y-1.5 lg:pt-0.5">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    Webhook
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                    Keep bookings in sync when they change on Cal.com.
                  </p>
                </div>
                <div className="min-w-0">
                  <WebhookSecretCard
                    workspaceId={dashboard.workspaceId}
                    webhookUrl={`${origin}/api/cal/webhook?workspace_id=${dashboard.workspaceId}`}
                    hasOwnSecret={hasOwnWebhookSecret}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
