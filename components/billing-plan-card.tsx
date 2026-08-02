"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck, IconCreditCard } from "@tabler/icons-react";
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
import type { WorkspaceBilling } from "@/lib/billing";
import { featuresForTier, PLAN_PRICE_USD } from "@/lib/plan-features";

type Props = {
  workspaceBilling: WorkspaceBilling;
  workspaceId: string;
};

export function BillingPlanCard({ workspaceBilling, workspaceId: _workspaceId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const currentTier = workspaceBilling.planTier;

  async function handleSubscribe(planTier: "starter" | "pro") {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planTier }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.url) router.push(data.url);
  }

  const tiers = ["starter", "pro"] as const;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {tiers.map((tier) => {
        const isCurrent = currentTier === tier;
        const price = `$${PLAN_PRICE_USD[tier]}`;
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
              <CardDescription>
                <span className="text-2xl font-bold text-foreground">
                  {price}
                </span>
                <span className="text-muted-foreground">/mo</span>
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
            <CardFooter>
              {isCurrent ? (
                <Button variant="outline" className="w-full" disabled>
                  <IconCreditCard className="mr-2 h-4 w-4" />
                  {t("dashboard.billing.currentPlan")}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => handleSubscribe(tier)}
                >
                  <IconCreditCard className="mr-2 h-4 w-4" />
                  {t("dashboard.billing.upgradeTo", {
                    plan: planName,
                  })}
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
