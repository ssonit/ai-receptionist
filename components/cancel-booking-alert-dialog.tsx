"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelManualBookingAction } from "@/app/dashboard/bookings/actions";

export type CancelBookingTarget = {
  id: string;
  guest_name: string;
  start_time: string;
};

export function CancelBookingAlertDialog({
  booking,
  timeZone,
  open,
  onOpenChange,
}: {
  booking: CancelBookingTarget | null;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (!booking) return;
    setPending(true);
    setError(null);
    const result = await cancelManualBookingAction({
      bookingId: booking.id,
      reason: reason.trim() || undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Booking cancelled");
    onOpenChange(false);
    router.refresh();
  }

  const whenLabel = booking
    ? new Date(booking.start_time).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      })
    : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {booking ? `${booking.guest_name} — ${whenLabel}. ` : ""}
            This cancels it on Cal.com too and can&apos;t be undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-booking-reason">Reason (optional)</Label>
          <Textarea
            id="cancel-booking-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
          >
            {pending ? "Cancelling…" : "Cancel booking"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
