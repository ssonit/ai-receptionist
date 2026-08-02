import { Suspense } from "react";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard-shell";
import { BillingPayClient } from "@/app/_components/billing-pay-client";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createTranslator } from "@/lib/i18n";
import { DASHBOARD_LOCALE_COOKIE } from "@/lib/locale";

export default async function BillingPayPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.billing);
  const cookieStore = await cookies();
  const locale = cookieStore.get(DASHBOARD_LOCALE_COOKIE)?.value ?? "en";
  const t = createTranslator(locale);

  return (
    <DashboardShell
      title={t("dashboard.billing.payTitle")}
      user={dashboard.navUser}
      workspaceId={dashboard.workspaceId}
    >
      <div className="p-4 md:p-6">
        <Suspense fallback={null}>
          <BillingPayClient />
        </Suspense>
      </div>
    </DashboardShell>
  );
}
