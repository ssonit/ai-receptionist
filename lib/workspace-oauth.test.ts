/**
 * workspace OAuth integration tests — getCalAccessTokenForWorkspace resolver.
 * Uses SupabaseMock for DB state; stubs cal-oauth refresh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/cal-oauth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cal-oauth")>("@/lib/cal-oauth");
  return {
    ...actual,
    refreshAccessToken: vi.fn(),
  };
});

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_ID = "aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("getCalAccessTokenForWorkspace", () => {
  it("returns env key for Eve Pilot", async () => {
    const { getCalAccessTokenForWorkspace } = await import("./workspace");
    const result = await getCalAccessTokenForWorkspace(PILOT_ID);
    expect(result).toBe("test-cal-api-key");
  });

  it("returns decrypted OAuth access token when not expired", async () => {
    const { encryptSecret } = await import("./workspace-secrets");
    const accessToken = encryptSecret("oauth-access-token-plain");
    const refreshToken = encryptSecret("oauth-refresh-token-plain");

    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        name: "Tenant",
        slug: "tenant",
        timezone: "Asia/Ho_Chi_Minh",
        cal_auth_mode: "oauth",
        cal_oauth_access_encrypted: accessToken,
        cal_oauth_refresh_encrypted: refreshToken,
        cal_oauth_expires_at: new Date(Date.now() + 600_000).toISOString(), // 10 min from now
        cal_oauth_scope: "PROFILE_READ BOOKING_READ",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);

    const { getCalAccessTokenForWorkspace } = await import("./workspace");
    const result = await getCalAccessTokenForWorkspace(TENANT_ID);
    expect(result).toBe("oauth-access-token-plain");
  });

  it("auto-refreshes expired OAuth token", async () => {
    const { encryptSecret } = await import("./workspace-secrets");
    const accessToken = encryptSecret("old-access-token");
    const refreshToken = encryptSecret("refresh-token-plain");

    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        name: "Tenant",
        slug: "tenant",
        timezone: "Asia/Ho_Chi_Minh",
        cal_auth_mode: "oauth",
        cal_oauth_access_encrypted: accessToken,
        cal_oauth_refresh_encrypted: refreshToken,
        cal_oauth_expires_at: new Date(Date.now() - 60_000).toISOString(), // expired
        cal_oauth_scope: "PROFILE_READ",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);

    const oauthMod = await import("@/lib/cal-oauth");
    vi.mocked(oauthMod.refreshAccessToken).mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 1800,
      scope: "PROFILE_READ BOOKING_READ",
    });

    const { getCalAccessTokenForWorkspace } = await import("./workspace");
    const result = await getCalAccessTokenForWorkspace(TENANT_ID);

    expect(result).toBe("new-access-token");
    expect(oauthMod.refreshAccessToken).toHaveBeenCalledWith("refresh-token-plain");

    // Verify new tokens were persisted
    const rows = supabaseMock.getRows("workspaces");
    const updated = rows.find((r) => r.id === TENANT_ID);
    expect(updated).toBeDefined();
    expect(updated!.cal_oauth_access_encrypted).toBeTruthy();
  });

  it("clears OAuth on refresh failure", async () => {
    const { encryptSecret } = await import("./workspace-secrets");
    const accessToken = encryptSecret("old-access");
    const refreshToken = encryptSecret("bad-refresh");

    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        name: "Tenant",
        slug: "tenant",
        timezone: "Asia/Ho_Chi_Minh",
        cal_auth_mode: "oauth",
        cal_oauth_access_encrypted: accessToken,
        cal_oauth_refresh_encrypted: refreshToken,
        cal_oauth_expires_at: new Date(Date.now() - 60_000).toISOString(),
        cal_oauth_scope: "PROFILE_READ",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);

    const oauthMod = await import("@/lib/cal-oauth");
    vi.mocked(oauthMod.refreshAccessToken).mockRejectedValue(new Error("invalid_grant"));

    const { getCalAccessTokenForWorkspace } = await import("./workspace");
    await expect(getCalAccessTokenForWorkspace(TENANT_ID)).rejects.toThrow(
      "CAL_OAUTH_REFRESH_FAILED",
    );
  });

  it("returns decrypted API key for legacy api_key mode", async () => {
    const { encryptSecret } = await import("./workspace-secrets");
    const apiKey = encryptSecret("cal_live_legacy_key");

    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        name: "Tenant",
        slug: "tenant",
        timezone: "Asia/Ho_Chi_Minh",
        cal_auth_mode: "api_key",
        cal_oauth_access_encrypted: null,
        cal_oauth_refresh_encrypted: null,
        cal_oauth_expires_at: null,
        cal_oauth_scope: null,
        cal_api_key_encrypted: apiKey,
        service_mode: "onsite",
      },
    ]);

    const { getCalAccessTokenForWorkspace } = await import("./workspace");
    const result = await getCalAccessTokenForWorkspace(TENANT_ID);
    expect(result).toBe("cal_live_legacy_key");
  });

  it("throws when no credential is configured", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        name: "Tenant",
        slug: "tenant",
        timezone: "Asia/Ho_Chi_Minh",
        cal_auth_mode: null,
        cal_oauth_access_encrypted: null,
        cal_oauth_refresh_encrypted: null,
        cal_oauth_expires_at: null,
        cal_oauth_scope: null,
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);

    const { getCalAccessTokenForWorkspace } = await import("./workspace");
    await expect(getCalAccessTokenForWorkspace(TENANT_ID)).rejects.toThrow(
      "Cal.com is not configured",
    );
  });
});

describe("hasCalCredential", () => {
  it("returns true for oauth mode", async () => {
    const { hasCalCredential } = await import("./workspace");
    expect(hasCalCredential({ cal_auth_mode: "oauth" })).toBe(true);
  });

  it("returns true for api_key mode", async () => {
    const { hasCalCredential } = await import("./workspace");
    expect(hasCalCredential({ cal_auth_mode: "api_key" })).toBe(true);
  });

  it("returns true for legacy non-null cal_api_key_encrypted", async () => {
    const { hasCalCredential } = await import("./workspace");
    expect(hasCalCredential({ cal_api_key_encrypted: "encrypted-value" })).toBe(true);
  });

  it("returns false when neither mode nor key", async () => {
    const { hasCalCredential } = await import("./workspace");
    expect(hasCalCredential({})).toBe(false);
  });
});
