/**
 * cal-oauth unit tests — authorize URL, code exchange, refresh, profile.
 * Stubs fetch globally for deterministic Cal API responses.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const MOCK_CLIENT_ID = "cal-oauth-client-id";
const MOCK_CLIENT_SECRET = "cal-oauth-secret";
const MOCK_REDIRECT_URI = "http://localhost:3000/api/cal/oauth/callback";

function setOAuthEnv() {
  vi.stubEnv("CALCOM_OAUTH_CLIENT_ID", MOCK_CLIENT_ID);
  vi.stubEnv("CALCOM_OAUTH_CLIENT_SECRET", MOCK_CLIENT_SECRET);
  vi.stubEnv("CALCOM_OAUTH_REDIRECT_URI", MOCK_REDIRECT_URI);
}

beforeEach(() => {
  setOAuthEnv();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cal-oauth", () => {
  describe("validateOAuthEnv", () => {
    it("returns env vars when all set", async () => {
      const { validateOAuthEnv } = await import("./cal-oauth");
      const env = validateOAuthEnv();
      expect(env.clientId).toBe(MOCK_CLIENT_ID);
      expect(env.clientSecret).toBe(MOCK_CLIENT_SECRET);
      expect(env.redirectUri).toBe(MOCK_REDIRECT_URI);
    });

    it("throws when client id is missing", async () => {
      vi.stubEnv("CALCOM_OAUTH_CLIENT_ID", "");
      const { validateOAuthEnv } = await import("./cal-oauth");
      expect(() => validateOAuthEnv()).toThrow("CAL_OAUTH_NOT_CONFIGURED");
    });
  });

  describe("buildCalOAuthAuthorizeUrl", () => {
    it("builds correct authorize URL", async () => {
      const { buildCalOAuthAuthorizeUrl } = await import("./cal-oauth");
      const url = buildCalOAuthAuthorizeUrl("test-state-token");
      expect(url).toContain("https://app.cal.com/auth/oauth2/authorize");
      expect(url).toContain(`client_id=${encodeURIComponent(MOCK_CLIENT_ID)}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(MOCK_REDIRECT_URI)}`);
      expect(url).toContain("response_type=code");
      expect(url).toContain("state=test-state-token");
      expect(url).toContain("scope=");
    });
  });

  describe("exchangeCodeForToken", () => {
    it("returns tokens on success", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "access-abc",
            refresh_token: "refresh-xyz",
            expires_in: 1800,
            scope: "PROFILE_READ BOOKING_READ",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForToken } = await import("./cal-oauth");
      const result = await exchangeCodeForToken("auth-code-123");

      expect(result.access_token).toBe("access-abc");
      expect(result.refresh_token).toBe("refresh-xyz");
      expect(result.expires_in).toBe(1800);

      const body = mockFetch.mock.calls[0]![1]!.body as string;
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("code=auth-code-123");
    });

    it("throws on error response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const { exchangeCodeForToken } = await import("./cal-oauth");
      await expect(exchangeCodeForToken("bad-code")).rejects.toThrow();
    });
  });

  describe("refreshAccessToken", () => {
    it("exchanges refresh token for new tokens", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              access_token: "new-access",
              refresh_token: "new-refresh",
              expires_in: 1800,
              scope: "PROFILE_READ BOOKING_READ",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );

      const { refreshAccessToken } = await import("./cal-oauth");
      const result = await refreshAccessToken("old-refresh-token");

      expect(result.access_token).toBe("new-access");
      expect(result.refresh_token).toBe("new-refresh");
    });
  });

  describe("persistOAuthTokens", () => {
    it("encrypts tokens and sets expiry", async () => {
      vi.stubEnv("WORKSPACE_SECRETS_KEY", "test-key-32-bytes-long!!!!!!");
      const { persistOAuthTokens } = await import("./cal-oauth");
      const store = persistOAuthTokens({
        access_token: "plain-access",
        refresh_token: "plain-refresh",
        expires_in: 3600,
        scope: "PROFILE_READ",
      });

      // Encrypted values should differ from plain text
      expect(store.accessEncrypted).not.toBe("plain-access");
      expect(store.refreshEncrypted).not.toBe("plain-refresh");
      expect(store.accessEncrypted).not.toBe(store.refreshEncrypted);
      expect(store.scope).toBe("PROFILE_READ");
      // expiresAt should be ~1 hour in the future
      const exp = new Date(store.expiresAt).getTime();
      expect(exp).toBeGreaterThan(Date.now() + 3500 * 1000);
    });
  });
});
