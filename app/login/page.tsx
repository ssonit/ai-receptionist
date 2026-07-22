import Link from "next/link";
import { AuthShell } from "@/app/_components/auth-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";

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
      <LoginForm nextPath={nextPath} />
    </AuthShell>
  );
}
