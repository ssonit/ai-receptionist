/**
 * Cal.com OAuth access-token refresh path in getCalAccessTokenForWorkspace.
 * Supabase is mocked globally via tests/setup.ts; only the token endpoint is stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";

const { refreshAccessToken } = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("@/lib/cal-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cal-oauth")>();
  return { ...actual, refreshAccessToken };
});

import { CalOAuthError } from "./cal-oauth";
import { decryptSecret, encryptSecret } from "./workspace-secrets";
import { getCalAccessTokenForWorkspace } from "./workspace";

const TENANT = "11111111-1111-4111-8111-111111111111";

/** Expired by default so every call takes the refresh branch. */
function seedOAuthWorkspace(overrides?: Record<string, unknown>) {
  supabaseMock.seed("workspaces", [
    {
      id: TENANT,
      cal_auth_mode: "oauth",
      cal_api_key_encrypted: null,
      cal_oauth_access_encrypted: encryptSecret("old-access"),
      cal_oauth_refresh_encrypted: encryptSecret("old-refresh"),
      cal_oauth_expires_at: new Date(Date.now() - 60_000).toISOString(),
      cal_oauth_scope: "read",
      ...overrides,
    },
  ]);
}

function row() {
  return supabaseMock.getRows("workspaces")[0];
}

beforeEach(() => {
  refreshAccessToken.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("CalOAuthError", () => {
  it("treats a rejected grant as definitive", () => {
    expect(new CalOAuthError("invalid_grant", 400).definitive).toBe(true);
    expect(new CalOAuthError("unauthorized", 401).definitive).toBe(true);
  });

  it("treats server errors and network failures as transient", () => {
    expect(new CalOAuthError("bad gateway", 502).definitive).toBe(false);
    expect(new CalOAuthError("timed out", 0).definitive).toBe(false);
  });
});

describe("getCalAccessTokenForWorkspace — OAuth refresh", () => {
  it("returns the stored token when it is not near expiry", async () => {
    seedOAuthWorkspace({
      cal_oauth_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });

    await expect(getCalAccessTokenForWorkspace(TENANT)).resolves.toBe("old-access");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes and persists the rotated token pair", async () => {
    seedOAuthWorkspace();
    refreshAccessToken.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 1800,
      scope: "read write",
    });

    await expect(getCalAccessTokenForWorkspace(TENANT)).resolves.toBe("new-access");
    // AES-GCM uses a random IV, so compare plaintext, not ciphertext.
    expect(decryptSecret(row().cal_oauth_access_encrypted as string)).toBe("new-access");
    expect(decryptSecret(row().cal_oauth_refresh_encrypted as string)).toBe("new-refresh");
    expect(row().cal_oauth_scope).toBe("read write");
  });

  it("keeps credentials when the refresh fails transiently", async () => {
    seedOAuthWorkspace();
    refreshAccessToken.mockRejectedValue(new CalOAuthError("bad gateway", 502));

    await expect(getCalAccessTokenForWorkspace(TENANT)).rejects.toThrow(
      "CAL_OAUTH_REFRESH_FAILED",
    );

    // A Cal.com blip must not force the owner through the whole OAuth flow again.
    expect(row().cal_auth_mode).toBe("oauth");
    expect(row().cal_oauth_access_encrypted).toBeTruthy();
    expect(row().cal_oauth_refresh_encrypted).toBeTruthy();
  });

  it("keeps credentials when the refresh times out", async () => {
    seedOAuthWorkspace();
    refreshAccessToken.mockRejectedValue(new CalOAuthError("timed out", 0));

    await expect(getCalAccessTokenForWorkspace(TENANT)).rejects.toThrow();
    expect(row().cal_auth_mode).toBe("oauth");
  });

  it("clears credentials only when Cal.com rejects the grant", async () => {
    seedOAuthWorkspace();
    refreshAccessToken.mockRejectedValue(new CalOAuthError("invalid_grant", 400));

    await expect(getCalAccessTokenForWorkspace(TENANT)).rejects.toThrow(
      "CAL_OAUTH_REFRESH_FAILED",
    );

    expect(row().cal_auth_mode).toBeNull();
    expect(row().cal_oauth_access_encrypted).toBeNull();
    expect(row().cal_oauth_refresh_encrypted).toBeNull();
  });

  it("uses the winner's token when a concurrent request rotated first", async () => {
    seedOAuthWorkspace();

    // Cal.com retires the old refresh token the moment another request uses
    // it, so ours comes back invalid_grant even though the integration is fine.
    refreshAccessToken.mockImplementation(async () => {
      const target = row();
      target.cal_oauth_access_encrypted = encryptSecret("winner-access");
      target.cal_oauth_refresh_encrypted = encryptSecret("winner-refresh");
      throw new CalOAuthError("invalid_grant", 400);
    });

    await expect(getCalAccessTokenForWorkspace(TENANT)).resolves.toBe(
      "winner-access",
    );
    // Credentials must survive — this is the bug that disconnects busy tenants.
    expect(row().cal_auth_mode).toBe("oauth");
  });
});
