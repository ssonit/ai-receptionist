/**
 * Public signup gate. `open` (default) keeps /signup self-serve;
 * `invite_only` restricts new accounts to workspace invite tokens.
 */
export function isPublicSignupOpen(): boolean {
  const mode = process.env.EVE_SIGNUP_MODE?.trim().toLowerCase();
  return mode !== "invite_only";
}
