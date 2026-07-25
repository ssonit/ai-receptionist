"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  confirmReminderOptOutAction,
  type UnsubscribeActionState,
} from "./actions";

const initialState: UnsubscribeActionState = { ok: false, message: "" };

export function UnsubscribeConfirmForm({
  slug,
  token,
}: {
  slug: string;
  token: string;
}) {
  const [state, action, pending] = useActionState(
    confirmReminderOptOutAction,
    initialState,
  );

  if (state.message) {
    return (
      <>
        <p className="text-muted-foreground max-w-md text-pretty">
          {state.message}
        </p>
        {state.ok ? (
          <p className="text-muted-foreground max-w-md text-sm text-pretty">
            This only stops reminders for this one appointment. It does not
            cancel the booking.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <form action={action} className="flex flex-col items-center gap-4">
      <input name="token" type="hidden" value={token} />
      <input name="slug" type="hidden" value={slug} />
      <p className="text-muted-foreground max-w-md text-pretty">
        Stop reminder emails for this appointment?
      </p>
      <Button disabled={pending} type="submit">
        {pending ? "Working…" : "Confirm — stop reminders"}
      </Button>
    </form>
  );
}
