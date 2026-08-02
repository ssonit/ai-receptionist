import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { AuthShell } from "@/app/_components/auth-shell";

export default function CheckEmailPage() {
  return (
    <AuthShell
      description="We sent a confirmation link to your email. Click it to activate your account and get started."
      footer={
        <Link className="transition hover:text-white" href={ROUTES.LOGIN}>
          &larr; Back to sign in
        </Link>
      }
      mode="signup"
      title="Check your inbox"
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          If you don&apos;t see the email, check your spam folder. The link
          expires after 24 hours.
        </p>
        <Link
          className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          href={ROUTES.LOGIN}
        >
          Go to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
