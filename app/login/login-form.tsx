"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/auth/actions";
import { Label } from "@/components/ui/label";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { cn } from "@/lib/utils";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { ROUTES } from "@/lib/routes";

const initial: AuthState = {};

const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-teal-400/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-teal-400/15";

export function LoginForm({
  nextPath,
  initialError,
}: {
  readonly nextPath: string;
  readonly initialError?: string;
}) {
  const [state, action, pending] = useActionState(signIn, initial);
  const errorMessage = state.error ?? initialError;

  return (
    <div className="flex w-full flex-col gap-5">
    <form action={action} className="flex flex-col gap-5">
      <input name="next" type="hidden" value={nextPath} />

      <div className="space-y-2">
        <Label className="text-zinc-400" htmlFor="login-email">
          Email
        </Label>
        <input
          autoComplete="email"
          className={fieldClass}
          id="login-email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-zinc-400" htmlFor="login-password">
            Password
          </Label>
          <span className="text-xs text-zinc-600">Min. 6 characters</span>
        </div>
        <input
          autoComplete="current-password"
          className={fieldClass}
          id="login-password"
          minLength={6}
          name="password"
          placeholder="••••••••"
          required
          type="password"
        />
      </div>

      {errorMessage ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <RainbowButton
        className={cn("mt-1 h-11 w-full rounded-full font-semibold", pending && "opacity-70")}
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in to dashboard"}
      </RainbowButton>
    </form>

      <GoogleSignInButton nextPath={nextPath} />

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-950 px-3 tracking-[0.14em] text-zinc-600">or</span>
        </div>
      </div>

      <Link
        className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        href="/chat"
      >
        Continue in public chat
      </Link>

      <p className="text-center text-sm text-zinc-500">
        No account yet?{" "}
        <Link className="text-white underline-offset-4 hover:underline" href={ROUTES.SIGNUP}>
          Create one
        </Link>
      </p>
    </div>
  );
}
