"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/auth/actions";
import { Label } from "@/components/ui/label";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { cn } from "@/lib/utils";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { track } from "@/lib/analytics-client";
import { ROUTES, inviteRoute } from "@/lib/routes";

const initial: AuthState = {};

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-teal-400/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-teal-400/15";

export function SignupForm({
  inviteToken,
  inviteEmail,
  workspaceName,
}: {
  inviteToken?: string | null;
  inviteEmail?: string | null;
  workspaceName?: string | null;
} = {}) {
  const [state, action, pending] = useActionState(signUp, initial);
  const joining = Boolean(inviteToken?.trim());

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-5"
      onSubmit={() => track(ANALYTICS_EVENT.SIGNUP_STARTED)}
    >
      {joining ? (
        <input name="inviteToken" type="hidden" value={inviteToken!.trim()} />
      ) : null}

      {joining ? (
        <p className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-2.5 text-sm text-teal-100">
          Joining{" "}
          <span className="font-medium text-white">
            {workspaceName?.trim() || "a workspace"}
          </span>{" "}
          as staff
          {inviteEmail ? (
            <>
              {" "}
              (use <span className="text-white">{inviteEmail}</span>)
            </>
          ) : null}
          .
        </p>
      ) : null}

      <div className="space-y-2">
        <Label className="text-zinc-400" htmlFor="signup-name">
          Full name
        </Label>
        <input
          autoComplete="name"
          className={fieldClass}
          id="signup-name"
          name="fullName"
          placeholder="Dr. Nguyen"
          type="text"
        />
        {!joining ? (
          <p className="text-xs text-zinc-600">
            Business name and booking URL are set in the setup wizard after
            signup.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-400" htmlFor="signup-email">
          Email
        </Label>
        <input
          autoComplete="email"
          className={fieldClass}
          defaultValue={inviteEmail ?? undefined}
          id="signup-email"
          name="email"
          placeholder="you@example.com"
          readOnly={Boolean(inviteEmail)}
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-zinc-400" htmlFor="signup-password">
            Password
          </Label>
          <span className="text-xs text-zinc-600">At least 6 characters</span>
        </div>
        <input
          autoComplete="new-password"
          className={fieldClass}
          id="signup-password"
          minLength={6}
          name="password"
          placeholder="••••••••"
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
        className={cn(
          "mt-1 h-11 w-full rounded-full font-semibold",
          pending && "opacity-70",
        )}
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending
          ? joining
            ? "Joining…"
            : "Creating…"
          : joining
            ? "Create account & join"
            : "Create account"}
      </RainbowButton>

      <p className="text-center text-xs leading-relaxed text-zinc-600">
        By continuing you agree to use Eve for scheduling support.
      </p>

      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link
          className="text-white underline-offset-4 hover:underline"
          href={
            joining
              ? `/login?next=${encodeURIComponent(inviteRoute(inviteToken!.trim()))}`
              : "/login"
          }
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
