/**
 * Zalo OAuth — PKCE, state payload, and connect persistence.
 * Network is stubbed; the database half lives in zalo-oauth-refresh.test.ts.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthState, parseOAuthState } from "./cal-oauth-state";
import { createPkcePair, resolveZaloRedirectUri } from "./zalo-oauth";

afterEach(() => vi.restoreAllMocks());

describe("createPkcePair", () => {
  it("produces a verifier in the RFC 7636 length range", () => {
    const { verifier } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("produces a challenge that is base64url(sha256(verifier))", () => {
    const { verifier, challenge } = createPkcePair();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("produces a different verifier each call", () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});

describe("oauth state with code verifier", () => {
  const WS = "00000000-0000-4000-8000-000000000001";

  it("round-trips the verifier through the signed token", () => {
    const { token } = createOAuthState(WS, "/dashboard/settings", "verifier-abc");
    expect(parseOAuthState(token, WS)?.codeVerifier).toBe("verifier-abc");
  });

  it("still works for callers that pass no verifier", () => {
    const { token } = createOAuthState(WS, "/dashboard/settings");
    const payload = parseOAuthState(token, WS);
    expect(payload?.workspaceId).toBe(WS);
    expect(payload?.codeVerifier).toBeUndefined();
  });

  it("rejects a token whose verifier was altered", () => {
    const { token } = createOAuthState(WS, "/dashboard/settings", "verifier-abc");
    const [encoded, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    payload.codeVerifier = "attacker-verifier";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(parseOAuthState(forged, WS)).toBeNull();
  });
});

describe("resolveZaloRedirectUri", () => {
  it("prefers the configured env value", () => {
    expect(resolveZaloRedirectUri("https://app.example.com/api/zalo/oauth/start")).toBe(
      "http://localhost:3000/api/zalo/oauth/callback",
    );
  });

  it("derives from the request origin when env is unset", () => {
    vi.stubEnv("ZALO_REDIRECT_URI", "");
    expect(resolveZaloRedirectUri("https://app.example.com/api/zalo/oauth/start")).toBe(
      "https://app.example.com/api/zalo/oauth/callback",
    );
  });
});

