import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { AuthShell } from "@/app/_components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      description="Enter a new password for your account."
      footer={
        <Link className="transition hover:text-white" href={ROUTES.LOGIN}>
          &larr; Back to sign in
        </Link>
      }
      mode="login"
      title="Set a new password"
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
