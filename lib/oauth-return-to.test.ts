/**
 * Open-redirect guard on the OAuth `returnTo` round-trip (Cal.com + Messenger
 * share this state helper).
 */
import { describe, expect, it } from "vitest";
import { createOAuthState, parseOAuthState, safeReturnTo } from "./cal-oauth-state";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const FALLBACK = "/dashboard/setup";

describe("safeReturnTo", () => {
  it("keeps ordinary same-origin paths", () => {
    expect(safeReturnTo("/dashboard/settings", FALLBACK)).toBe("/dashboard/settings");
    expect(safeReturnTo("/dashboard/setup?step=2", FALLBACK)).toBe("/dashboard/setup?step=2");
  });

  it("rejects a protocol-relative URL", () => {
    // "//evil.com" passes a naive startsWith("/") check, and
    // new URL("//evil.com", "https://app…") resolves to https://evil.com
    expect(safeReturnTo("//evil.com", FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo("//evil.com/phish?a=1", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects the backslash variant", () => {
    expect(safeReturnTo("/\\evil.com", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects absolute URLs", () => {
    expect(safeReturnTo("https://evil.com", FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });
});

describe("OAuth state round-trip", () => {
  it("never round-trips an off-origin returnTo", () => {
    const { token } = createOAuthState(WORKSPACE_ID, "//evil.com");
    const parsed = parseOAuthState(token, WORKSPACE_ID);

    expect(parsed).not.toBeNull();
    expect(parsed?.returnTo).toBe(FALLBACK);
    // The redirect the callback would actually issue.
    expect(new URL(parsed!.returnTo, "https://app.eve.com/api/x").origin).toBe(
      "https://app.eve.com",
    );
  });

  it("preserves a legitimate returnTo", () => {
    const { token } = createOAuthState(WORKSPACE_ID, "/dashboard/settings");
    expect(parseOAuthState(token, WORKSPACE_ID)?.returnTo).toBe("/dashboard/settings");
  });

  it("rejects a token issued for another workspace", () => {
    const { token } = createOAuthState(WORKSPACE_ID, "/dashboard/settings");
    expect(parseOAuthState(token, "22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const { token } = createOAuthState(WORKSPACE_ID, "/dashboard/settings");
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        workspaceId: WORKSPACE_ID,
        returnTo: "//evil.com",
        nonce: "x",
        exp: Date.now() + 60_000,
      }),
      "utf8",
    ).toString("base64url");

    expect(parseOAuthState(`${forged}.${signature}`, WORKSPACE_ID)).toBeNull();
  });
});
