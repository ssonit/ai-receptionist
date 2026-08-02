"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";

type PaymentStatus = {
  id: string;
  status: string;
  planTier: string;
  amount: number;
  currency: string;
  paymentCode: string;
  qrUrl: string | null;
  periodEndsAt: string | null;
};

export function BillingPayClient() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("missing");
      return;
    }

    let cancelled = false;

    async function load() {
      const res = await fetch(
        `/api/billing/payment-status?id=${encodeURIComponent(id!)}${
          searchParams.get("test") ? `&plan=${searchParams.get("plan") ?? "starter"}` : ""
        }`,
      );
      if (!res.ok) {
        if (!cancelled) setError("load_failed");
        return;
      }
      const data = (await res.json()) as PaymentStatus;
      if (!cancelled) setPayment(data);
    }

    void load();
    const timer = setInterval(() => {
      void load();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, searchParams]);

  useEffect(() => {
    if (payment?.status === "paid") {
      const tmr = setTimeout(() => {
        router.push(`${DASHBOARD_PATH.billing}?checkout=success`);
      }, 1500);
      return () => clearTimeout(tmr);
    }
  }, [payment?.status, router]);

  if (error) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        {t("dashboard.billing.payLoadError")}
        <div className="mt-4">
          <Button variant="outline" onClick={() => router.push(DASHBOARD_PATH.billing)}>
            {t("dashboard.billing.backToBilling")}
          </Button>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconLoader2 className="h-4 w-4 animate-spin" />
        {t("dashboard.billing.payLoading")}
      </div>
    );
  }

  if (payment.status === "paid") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-8 text-green-900">
        <IconCheck className="h-8 w-8" />
        <p className="font-medium">{t("dashboard.billing.paySuccess")}</p>
      </div>
    );
  }

  const amountLabel = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(payment.amount);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border p-6">
      <h2 className="text-lg font-semibold">{t("dashboard.billing.payTitle")}</h2>
      <p className="text-center text-sm text-muted-foreground">
        {t("dashboard.billing.payHint")}
      </p>
      {payment.qrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={payment.qrUrl}
          alt="VietQR"
          className="h-64 w-64 rounded-md border bg-white p-2"
        />
      ) : null}
      <div className="w-full space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">{t("dashboard.billing.payAmount")}: </span>
          <span className="font-semibold">{amountLabel}</span>
        </p>
        <p>
          <span className="text-muted-foreground">{t("dashboard.billing.payCode")}: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{payment.paymentCode}</code>
        </p>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
        {t("dashboard.billing.payWaiting")}
      </p>
      <Button variant="ghost" onClick={() => router.push(DASHBOARD_PATH.billing)}>
        {t("dashboard.billing.backToBilling")}
      </Button>
    </div>
  );
}
