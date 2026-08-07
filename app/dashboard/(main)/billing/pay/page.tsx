import { Suspense } from "react";
import { BillingPayClient } from "@/app/_components/billing-pay-client";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";

export default async function BillingPayPage() {
  await assertOwnerPage(DASHBOARD_PATH.billing);

  return (
    <div className="p-4 md:p-6">
      <Suspense fallback={null}>
        <BillingPayClient />
      </Suspense>
    </div>
  );
}
