"use client";

import { useActionState } from "react";
import { resetPassword, type AuthState } from "@/app/auth/actions";
import { Label } from "@/components/ui/label";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { cn } from "@/lib/utils";

const initial: AuthState = {};

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-teal-400/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-teal-400/15";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <div className="space-y-2">
        <Label className="text-zinc-400" htmlFor="reset-password">
          New password
        </Label>
        <input
          autoComplete="new-password"
          className={fieldClass}
          id="reset-password"
          minLength={6}
          name="password"
          placeholder="At least 6 characters"
          required
          type="password"
        />
      </div>

      {state.error ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <RainbowButton
        className={cn("mt-1 h-11 w-full rounded-full font-semibold", pending && "opacity-70")}
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending ? "Saving…" : "Set new password"}
      </RainbowButton>
    </form>
  );
}
