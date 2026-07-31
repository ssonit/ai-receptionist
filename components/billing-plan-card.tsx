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
import type {
  PlanTier,
  WorkspaceBilling,
} from "@/lib/billing";

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};

const PLAN_PRICES: Record<PlanTier, string | null> = {
  free: null,
  starter: "$19",
  pro: "$49",
};

const PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: [
    "14-day trial",
    "Web chat",
    "Cal.com booking",
    "FAQ + intake",
    "Basic dashboard",
  ],
  starter: [
    "50 bookings/mo",
    "1 user",
    "Web embed",
    "EN/VI AI agent",
  ],
  pro: [
    "200 bookings/mo",
    "3 users",
    "Zalo / WhatsApp",
    "Email reminders",
  ],
};

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
        const price = PLAN_PRICES[tier];

        return (
          <Card key={tier} className={isCurrent ? "border-primary" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {PLAN_LABELS[tier]}
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
                {price ? (
                  <span className="text-muted-foreground">/mo</span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {PLAN_FEATURES[tier].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <IconCheck className="h-4 w-4 text-primary" />
                    {f}
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
                    plan: PLAN_LABELS[tier],
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
