"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncBookingsAction } from "@/app/dashboard/(main)/bookings/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BookingsSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await syncBookingsAction();
          if (result.error) {
            toast.error(result.error);
            return;
          }
          if (result.success) {
            toast.success(result.success);
          }
          router.refresh();
        });
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {pending ? "Syncing…" : "Sync Cal.com"}
    </Button>
  );
}
