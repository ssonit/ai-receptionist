import Link from "next/link";
import { AuthShell } from "@/app/_components/auth-shell";
import { SignupForm } from "../login/signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      description="Create an account to open the booking dashboard. Your profile is created automatically after signup."
      footer={
        <Link className="transition hover:text-white" href="/">
          ← Back to home
        </Link>
      }
      mode="signup"
      title="Create your account"
    >
      <SignupForm />
    </AuthShell>
  );
}
