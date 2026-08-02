"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword, type AuthState } from "@/app/auth/actions";
import { ROUTES } from "@/lib/routes";
import { Label } from "@/components/ui/label";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { cn } from "@/lib/utils";

const initial: AuthState = {};

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-teal-400/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-teal-400/15";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, initial);

  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <div className="space-y-2">
        <Label className="text-zinc-400" htmlFor="forgot-email">
          Email
        </Label>
        <input
          autoComplete="email"
          className={fieldClass}
          id="forgot-email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
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

      {state.success ? (
        <p
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300"
          role="alert"
        >
          {state.success}
        </p>
      ) : null}

      <RainbowButton
        className={cn(
          "mt-1 h-11 w-full rounded-full font-semibold",
          pending && "opacity-70",
        )}
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending ? "Sending…" : "Send reset link"}
      </RainbowButton>

      <p className="text-center text-sm text-zinc-400">
        Remember your password?{" "}
        <Link
          className="text-white underline-offset-4 hover:underline"
          href={ROUTES.LOGIN}
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
