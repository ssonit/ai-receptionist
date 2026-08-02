/**
 * Zalo token rotation. Runs against local Postgres (`npx supabase start`) —
 * the claim is a database behaviour, and a mocked client would make the
 * concurrency test prove nothing. Skipped when no database is reachable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteChannelConnection,
  getChannelConnection,
  upsertChannelConnection,
} from "./channel-connections";

const WS = "00000000-0000-4000-8000-000000000002";

/** Module scope, not beforeAll — see the note in channel-connections.test.ts. */
const dbUp = await (async () => {
  try {
    const admin = createAdminClient();
    await admin.from("workspaces").upsert(
      { id: WS, name: "Zalo Refresh WS", slug: "zalo-refresh-ws" },
      { onConflict: "id" },
    );
    const { error } = await admin.from("workspaces").select("id").eq("id", WS).single();
    return !error;
  } catch {
    return false;
  }
})();

afterEach(async () => {
  if (dbUp) await deleteChannelConnection(WS, "zalo");
  vi.restoreAllMocks();
  vi.resetModules();
});

async function seedConnection(expiresInMs: number) {
  await upsertChannelConnection({
    workspaceId: WS,
    provider: "zalo",
    externalId: "oa_refresh",
    displayName: "Refresh OA",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  });
}

/** Load zalo-oauth with lib/zalo mocked, so no network is touched. */
async function loadWithRefreshStub(
  impl: (refreshToken: string) => Promise<unknown>,
) {
  const refreshZaloToken = vi.fn(impl);
  vi.doMock("@/lib/zalo", async () => ({
    ...(await vi.importActual<typeof import("./zalo")>("./zalo")),
    refreshZaloToken,
  }));
  const mod = await import("./zalo-oauth");
  return { getZaloAccessToken: mod.getZaloAccessToken, refreshZaloToken };
}

const freshTokens = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

describe.skipIf(!dbUp)("getZaloAccessToken", () => {
  it("returns the stored token when it is comfortably valid", async () => {
    await seedConnection(3_600_000);
    const { getZaloAccessToken, refreshZaloToken } = await loadWithRefreshStub(
      async () => freshTokens,
    );

    expect(await getZaloAccessToken(WS)).toBe("old-access");
    expect(refreshZaloToken).not.toHaveBeenCalled();
  });

  it("refreshes a token expiring inside the 5-minute skew", async () => {
    await seedConnection(60_000);
    const { getZaloAccessToken, refreshZaloToken } = await loadWithRefreshStub(
      async () => freshTokens,
    );

    expect(await getZaloAccessToken(WS)).toBe("new-access");
    expect(refreshZaloToken).toHaveBeenCalledWith("old-refresh");

    const stored = await getChannelConnection(WS, "zalo");
    expect(stored?.refreshToken).toBe("new-refresh");
  });

  it("refreshes exactly once under two concurrent callers", async () => {
    await seedConnection(-1_000);
    const { getZaloAccessToken, refreshZaloToken } = await loadWithRefreshStub(
      async () => {
        // Hold the lock long enough for the loser to observe it.
        await new Promise((r) => setTimeout(r, 150));
        return freshTokens;
      },
    );

    const [a, b] = await Promise.all([
      getZaloAccessToken(WS),
      getZaloAccessToken(WS),
    ]);

    expect(refreshZaloToken).toHaveBeenCalledTimes(1);
    expect(a).toBe("new-access");
    expect(b).toBe("new-access");
  });

  it("releases the lock when the refresh call fails", async () => {
    await seedConnection(-1_000);
    const first = await loadWithRefreshStub(async () => {
      throw new Error("network down");
    });
    await expect(first.getZaloAccessToken(WS)).rejects.toThrow();

    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_channel_connections")
      .select("refresh_lock_at")
      .eq("workspace_id", WS)
      .eq("provider", "zalo")
      .single();

    expect(data!.refresh_lock_at).toBeNull();
  });

  it("clears the connection and notifies the owner on a rejected refresh token", async () => {
    await seedConnection(-1_000);
    const createNotification = vi.fn(async () => "notif-1");
    vi.doMock("@/lib/notifications-write", () => ({ createNotification }));

    const { getZaloAccessToken } = await loadWithRefreshStub(async () => {
      throw new Error("Refresh token is invalid or expired");
    });

    await expect(getZaloAccessToken(WS)).rejects.toThrow();

    expect(await getChannelConnection(WS, "zalo")).toBeNull();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, severity: "high" }),
    );
  });

  it("throws when the workspace has no Zalo connection", async () => {
    const { getZaloAccessToken } = await loadWithRefreshStub(async () => freshTokens);
    await expect(getZaloAccessToken(WS)).rejects.toThrow("ZALO_NOT_CONFIGURED");
  });
});

