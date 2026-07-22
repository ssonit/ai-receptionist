"use client";

import { useTransition } from "react";
import { syncBookingsAction } from "@/app/dashboard/bookings/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BookingsSyncButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await syncBookingsAction();
          if (result.error) {
            toast.error(result.error);
          } else if (result.success) {
            toast.success(result.success);
          }
        });
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {pending ? "Đang đồng bộ…" : "Đồng bộ Cal.com"}
    </Button>
  );
}
