import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { AuthShell } from "@/app/_components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="Enter your email and we&apos;ll send you a reset link."
      footer={
        <Link className="transition hover:text-white" href={ROUTES.LOGIN}>
          &larr; Back to sign in
        </Link>
      }
      mode="login"
      title="Forgot your password?"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
