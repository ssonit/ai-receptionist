"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DashboardRefreshButton({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const wasPending = useRef(false);
  const label = t("dashboard.reload");
  const successMessage = t("dashboard.refreshed");

  useEffect(() => {
    if (wasPending.current && !pending) {
      toast.success(successMessage);
    }
    wasPending.current = pending;
  }, [pending, successMessage]);

  return (
    <Button
      aria-label={pending ? t("dashboard.reloading") : label}
      className={cn(className)}
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      size="icon-sm"
      title={label}
      type="button"
      variant="outline"
    >
      <IconRefresh className={cn("size-4", pending && "animate-spin")} />
      <span className="sr-only">
        {pending ? t("dashboard.reloading") : label}
      </span>
    </Button>
  );
}
