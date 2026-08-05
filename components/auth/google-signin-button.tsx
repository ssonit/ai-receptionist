import { signInWithGoogle } from "@/app/auth/actions";

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.27 14.27a7.2 7.2 0 010-4.54V6.62H1.27a12 12 0 000 10.76l4-3.11z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  nextPath,
  inviteToken,
}: {
  readonly nextPath: string;
  readonly inviteToken?: string | null;
}) {
  return (
    <form action={signInWithGoogle}>
      <input name="next" type="hidden" value={nextPath} />
      {inviteToken ? (
        <input name="inviteToken" type="hidden" value={inviteToken} />
      ) : null}
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        type="submit"
      >
        <GoogleGlyph />
        Continue with Google
      </button>
    </form>
  );
}
