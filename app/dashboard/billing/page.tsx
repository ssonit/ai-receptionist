import { cookies } from "next/headers";
import { IconCreditCard, IconAlertTriangle } from "@tabler/icons-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { BillingPlanCard } from "@/components/billing-plan-card";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createClient } from "@/lib/supabase/server";
import { createTranslator } from "@/lib/i18n";
import { DASHBOARD_LOCALE_COOKIE } from "@/lib/locale";
import {
  getBillingMode,
  isBillingEnabled,
  isSubActive,
  formatTrialDaysLeft,
  type WorkspaceBilling,
} from "@/lib/billing";

export default async function BillingPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.billing);

  const billingMode = getBillingMode();
  const billingEnabled = isBillingEnabled();
  let workspaceBilling: WorkspaceBilling = {
    planTier: "free",
    subscriptionStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
  };

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const { data: ws } = await supabase
      .from("workspaces")
      .select(
        "plan_tier, subscription_status, stripe_customer_id, stripe_subscription_id, trial_ends_at",
      )
      .eq("id", dashboard.workspaceId)
      .maybeSingle();

    if (ws) {
      workspaceBilling = {
        planTier: (ws.plan_tier as WorkspaceBilling["planTier"]) ?? "free",
        subscriptionStatus: (ws.subscription_status as WorkspaceBilling["subscriptionStatus"]) ?? null,
        stripeCustomerId: (ws.stripe_customer_id as string | null) ?? null,
        stripeSubscriptionId: (ws.stripe_subscription_id as string | null) ?? null,
        trialEndsAt: (ws.trial_ends_at as string | null) ?? null,
      };
    }
  }

  const cookieStore = await cookies();
  const locale = cookieStore.get(DASHBOARD_LOCALE_COOKIE)?.value ?? "en";
  const t = createTranslator(locale);
  const subActive = isSubActive(workspaceBilling);
  const trialDays = formatTrialDaysLeft(workspaceBilling.trialEndsAt);

  return (
    <DashboardShell
      title={t("billing.title")}
      user={dashboard.navUser}
      workspaceId={dashboard.workspaceId}
    >
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("billing.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("billing.subtitle")}
          </p>
        </div>

        {!billingEnabled ? (
          <div className="flex items-start gap-3 rounded-lg border border-muted bg-muted/30 p-6 text-sm">
            <IconCreditCard className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {t("billing.disabledTitle")}
              </p>
              <p className="text-muted-foreground">
                {t("billing.disabledHint")}
              </p>
            </div>
          </div>
        ) : (
          <>
            {billingMode === "test" ? (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">{t("billing.testModeBanner")}</p>
                  <p className="text-amber-700">
                    Set{" "}
                    <code className="text-xs bg-amber-100 px-1 rounded">
                      BILLING_MODE=live
                    </code>{" "}
                    and configure Stripe keys to enable real checkout.
                  </p>
                </div>
              </div>
            ) : null}

            {workspaceBilling.planTier === "free" && trialDays > 0 ? (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <IconCreditCard className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {t("billing.trialRemaining")}: {trialDays}{" "}
                    {trialDays === 1 ? "day" : "days"}
                  </p>
                </div>
              </div>
            ) : null}

            {!subActive && workspaceBilling.planTier !== "free" ? (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {t("billing.subscriptionInactive")}
                  </p>
                  <p className="text-red-700">
                    {t("billing.subscriptionInactiveHint")}
                  </p>
                </div>
              </div>
            ) : null}

            <BillingPlanCard
              workspaceBilling={workspaceBilling}
              workspaceId={dashboard.workspaceId ?? ""}
            />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
