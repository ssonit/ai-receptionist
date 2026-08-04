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
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";

export type CancelBookingTarget = {
  id: string;
  guest_name: string;
  start_time: string;
};

function CancelBookingAlertDialogContent({
  booking,
  timeZone,
  onOpenChange,
  forceClose,
  pending,
  setPending,
}: {
  booking: CancelBookingTarget;
  timeZone: string;
  onOpenChange: (open: boolean) => void;
  forceClose: () => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await cancelManualBookingAction({
        bookingId: booking.id,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Booking cancelled");
      forceClose();
      router.refresh();
    } catch {
      setError(appErrorMessage(APP_ERROR_CODE.BOOKING_CANCEL_FAILED));
    } finally {
      setPending(false);
    }
  }

  const whenLabel = new Date(booking.start_time).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  return (
    <AlertDialogContent
      onEscapeKeyDown={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
        <AlertDialogDescription>
          {booking.guest_name} — {whenLabel}. This cancels it on Cal.com too and
          can&apos;t be undone from here.
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
  );
}

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
  const [pending, setPendingState] = React.useState(false);
  const pendingRef = React.useRef(false);
  const setPending = React.useCallback((next: boolean) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  const guardedOnOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && pendingRef.current) return;
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <AlertDialog open={open} onOpenChange={guardedOnOpenChange}>
      {booking ? (
        <CancelBookingAlertDialogContent
          key={booking.id}
          booking={booking}
          timeZone={timeZone}
          onOpenChange={guardedOnOpenChange}
          forceClose={() => onOpenChange(false)}
          pending={pending}
          setPending={setPending}
        />
      ) : null}
    </AlertDialog>
  );
}
