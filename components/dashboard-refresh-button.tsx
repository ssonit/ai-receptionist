"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DashboardRefreshButton({
  className,
  label = "Tải lại",
  successMessage = "Đã tải lại dữ liệu.",
}: {
  className?: string;
  label?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      toast.success(successMessage);
    }
    wasPending.current = pending;
  }, [pending, successMessage]);

  return (
    <Button
      aria-label={pending ? "Đang tải lại" : label}
      className={cn(className)}
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      size="sm"
      title={label}
      type="button"
      variant="outline"
    >
      <IconRefresh className={cn("size-4", pending && "animate-spin")} />
      <span className="hidden sm:inline">
        {pending ? "Đang tải…" : label}
      </span>
    </Button>
  );
}
