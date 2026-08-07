"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createManualBookingAction,
  getAvailableSlotsAction,
} from "@/app/dashboard/(main)/bookings/actions";

export type NewBookingMeetingType = {
  id: string;
  title: string;
  lengthMinutes: number;
};

type SlotOption = { start: string; display: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewBookingDialog({
  meetingTypes,
}: {
  meetingTypes: NewBookingMeetingType[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [meetingTypeId, setMeetingTypeId] = React.useState(
    meetingTypes[0]?.id ?? "",
  );
  const [date, setDate] = React.useState("");
  const [slots, setSlots] = React.useState<SlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [selectedStart, setSelectedStart] = React.useState<string | null>(
    null,
  );

  const loadSlots = React.useCallback(
    async (nextMeetingTypeId: string, nextDate: string) => {
      if (!nextMeetingTypeId || !nextDate) return;
      setSlotsLoading(true);
      setSlotsError(null);
      setSelectedStart(null);
      try {
        const result = await getAvailableSlotsAction({
          meetingTypeId: nextMeetingTypeId,
          date: nextDate,
        });
        if (!result.ok) {
          setSlots([]);
          setSlotsError(result.error);
          return;
        }
        setSlots(result.slots);
      } catch {
        setSlots([]);
        setSlotsError("Could not load open slots. Try again.");
      } finally {
        setSlotsLoading(false);
      }
    },
    [],
  );

  function resetForm() {
    setDate("");
    setSlots([]);
    setSlotsError(null);
    setSelectedStart(null);
  }

  const [submitState, submitAction, submitPending] = React.useActionState(
    async (
      _prev: { error?: string } | null,
      formData: FormData,
    ): Promise<{ error?: string } | null> => {
      if (!selectedStart) return { error: "Pick a time slot first." };
      const guestName = String(formData.get("guestName") ?? "").trim();
      const phone = String(formData.get("phone") ?? "").trim();
      const email = String(formData.get("email") ?? "").trim();
      const notes = String(formData.get("notes") ?? "").trim();
      if (!guestName || !phone || !email) {
        return { error: "Name, phone, and email are required." };
      }

      const result = await createManualBookingAction({
        meetingTypeId,
        start: selectedStart,
        guestName,
        phone,
        email,
        notes: notes || undefined,
      });
      if (!result.ok) return { error: result.error };

      toast.success("Booking created");
      setOpen(false);
      resetForm();
      router.refresh();
      return null;
    },
    null,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={meetingTypes.length === 0}>
          New booking
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Pick a real open slot — the same calendar the AI agent checks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-booking-meeting-type">Meeting type</Label>
          <Select
            value={meetingTypeId}
            onValueChange={(value) => {
              setMeetingTypeId(value);
              if (date) void loadSlots(value, date);
            }}
          >
            <SelectTrigger id="new-booking-meeting-type">
              <SelectValue placeholder="Select a meeting type" />
            </SelectTrigger>
            <SelectContent>
              {meetingTypes.map((mt) => (
                <SelectItem key={mt.id} value={mt.id}>
                  {mt.title} · {mt.lengthMinutes} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-booking-date">Date</Label>
          <Input
            id="new-booking-date"
            type="date"
            value={date}
            min={todayIso()}
            onChange={(e) => {
              setDate(e.target.value);
              if (meetingTypeId) void loadSlots(meetingTypeId, e.target.value);
            }}
          />
        </div>

        {slotsLoading ? (
          <p className="text-muted-foreground text-sm">
            Loading open slots…
          </p>
        ) : slotsError ? (
          <p className="text-destructive text-sm">{slotsError}</p>
        ) : date && slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open slots this day.
          </p>
        ) : slots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <Button
                key={slot.start}
                type="button"
                size="sm"
                variant={selectedStart === slot.start ? "default" : "outline"}
                onClick={() => setSelectedStart(slot.start)}
              >
                {slot.display}
              </Button>
            ))}
          </div>
        ) : null}

        <form action={submitAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new-booking-guest-name">Guest name</Label>
            <Input id="new-booking-guest-name" name="guestName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-booking-phone">Phone</Label>
            <Input id="new-booking-phone" name="phone" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-booking-email">Email</Label>
            <Input id="new-booking-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-booking-notes">Notes (optional)</Label>
            <Textarea id="new-booking-notes" name="notes" />
          </div>

          {submitState?.error ? (
            <p className="text-destructive text-sm">{submitState.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={submitPending || !selectedStart}>
              {submitPending ? "Creating…" : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
