"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck, IconCreditCard, IconQrcode } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  emptyWorkspaceBilling,
  type WorkspaceBilling,
} from "@/lib/billing";
import { featuresForTier, PLAN_PRICE_USD, PLAN_PRICE_VND } from "@/lib/plan-features";

type Props = {
  workspaceBilling: WorkspaceBilling;
  workspaceId: string;
};

export function BillingPlanCard({
  workspaceBilling = emptyWorkspaceBilling(),
  workspaceId: _workspaceId,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const currentTier = workspaceBilling.planTier;

  async function handleSubscribe(
    planTier: "starter" | "pro",
    rail: "polar" | "sepay",
  ) {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planTier, rail }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.url) router.push(data.url);
  }

  async function handlePortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    if (data.url) router.push(data.url);
  }

  const tiers = ["starter", "pro"] as const;
  const showPortal =
    workspaceBilling.billingProvider === "polar" &&
    Boolean(workspaceBilling.billingCustomerId);

  return (
    <div className="flex flex-col gap-4">
      {showPortal ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void handlePortal()}>
            {t("dashboard.billing.manageBilling")}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => {
          const isCurrent = currentTier === tier;
          const usd = `$${PLAN_PRICE_USD[tier]}`;
          const vnd = new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
            maximumFractionDigits: 0,
          }).format(PLAN_PRICE_VND[tier]);
          const planName = t(`dashboard.billing.planNames.${tier}`);
          const features = featuresForTier(tier);

          return (
            <Card key={tier} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {planName}
                  {isCurrent ? (
                    <Badge variant="default">
                      {t("dashboard.billing.currentPlan")}
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="space-y-1">
                  <div>
                    <span className="text-2xl font-bold text-foreground">{usd}</span>
                    <span className="text-muted-foreground">
                      {t("dashboard.billing.perMonthCard")}
                    </span>
                  </div>
                  <div className="text-sm">
                    {vnd}
                    {t("dashboard.billing.perMonthQr")}
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <IconCheck className="h-4 w-4 text-primary" />
                      {t(`dashboard.billing.features.${feature}`)}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    <IconCreditCard className="mr-2 h-4 w-4" />
                    {t("dashboard.billing.currentPlan")}
                  </Button>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      onClick={() => void handleSubscribe(tier, "sepay")}
                    >
                      <IconQrcode className="mr-2 h-4 w-4" />
                      {t("dashboard.billing.payVietQr")}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleSubscribe(tier, "polar")}
                    >
                      <IconCreditCard className="mr-2 h-4 w-4" />
                      {t("dashboard.billing.payCard")}
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
