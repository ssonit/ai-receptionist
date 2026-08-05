import Link from "next/link";
import { AuthShell } from "@/app/_components/auth-shell";
import { AUTH_ERROR_CODE, authErrorMessage, type AuthErrorCode } from "@/lib/errors";
import { LoginForm } from "./login-form";

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (Object.values(AUTH_ERROR_CODE) as string[]).includes(value);
}

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";
  const initialError = params.error
    ? authErrorMessage(
        isAuthErrorCode(params.error)
          ? params.error
          : AUTH_ERROR_CODE.SIGN_IN_FAILED,
      )
    : undefined;

  return (
    <AuthShell
      description={
        <>
          Manage bookings and leads. Patients can use the{" "}
          <Link className="text-white underline-offset-4 hover:underline" href="/chat">
            public chat
          </Link>
          .
        </>
      }
      footer={
        <Link className="transition hover:text-white" href="/">
          ← Back to home
        </Link>
      }
      mode="login"
      title="Welcome back"
    >
      <LoginForm initialError={initialError} nextPath={nextPath} />
    </AuthShell>
  );
}
