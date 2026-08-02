/**
 * Channel connection storage + refresh lock.
 * Requires a local Supabase (`npx supabase start`) — skipped otherwise.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  claimRefreshLock,
  deleteChannelConnection,
  getChannelConnection,
  getChannelConnectionByExternalId,
  releaseRefreshLock,
  upsertChannelConnection,
} from "./channel-connections";

const WS_A = "00000000-0000-4000-8000-000000000001"; // Pilot, from seed.sql

/**
 * Probe at module scope, not in beforeAll. `describe.skipIf` is evaluated when
 * the file is collected, which happens before any hook runs — a flag set in
 * beforeAll is still false at that point, so every test would silently skip
 * and the suite would look green while proving nothing.
 */
const { dbUp, WS_B } = await (async () => {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("workspaces").select("id").limit(1);
    if (error) return { dbUp: false, WS_B: "" };

    const { data } = await admin
      .from("workspaces")
      .insert({ name: "Zalo Test WS", slug: `zalo-test-${Date.now()}` })
      .select("id")
      .single();
    return { dbUp: true, WS_B: (data!.id as string) };
  } catch {
    return { dbUp: false, WS_B: "" };
  }
})();

afterEach(async () => {
  if (!dbUp) return;
  await deleteChannelConnection(WS_A, "zalo");
  if (WS_B) await deleteChannelConnection(WS_B, "zalo");
});

describe.skipIf(!dbUp)("channel connections", () => {
  it("round-trips a connection with decrypted tokens", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A,
      provider: "zalo",
      externalId: "oa_1",
      displayName: "Test OA",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const conn = await getChannelConnection(WS_A, "zalo");
    expect(conn?.externalId).toBe("oa_1");
    expect(conn?.accessToken).toBe("access-1");
    expect(conn?.refreshToken).toBe("refresh-1");
  });

  it("never stores the token in plaintext", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_1",
      accessToken: "super-secret-token",
    });

    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_channel_connections")
      .select("access_encrypted")
      .eq("workspace_id", WS_A)
      .eq("provider", "zalo")
      .single();

    expect(data!.access_encrypted).not.toContain("super-secret-token");
  });

  it("resolves a workspace from the external id", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_lookup",
    });
    const conn = await getChannelConnectionByExternalId("zalo", "oa_lookup");
    expect(conn?.workspaceId).toBe(WS_A);
  });

  it("refuses to link one OA to a second workspace", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_shared",
    });
    await expect(
      upsertChannelConnection({
        workspaceId: WS_B, provider: "zalo", externalId: "oa_shared",
      }),
    ).rejects.toThrow(CHANNEL_EXTERNAL_ID_TAKEN);
  });

  it("lets exactly one of two concurrent callers claim the lock", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_lock",
      refreshToken: "refresh-1",
    });

    const [a, b] = await Promise.all([
      claimRefreshLock(WS_A, "zalo"),
      claimRefreshLock(WS_A, "zalo"),
    ]);

    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
    const winner = a.claimed ? a : b;
    expect(winner.refreshToken).toBe("refresh-1");
  });

  it("reclaims a lock older than 30 seconds", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_stale",
      refreshToken: "refresh-1",
    });
    const admin = createAdminClient();
    await admin
      .from("workspace_channel_connections")
      .update({ refresh_lock_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("workspace_id", WS_A)
      .eq("provider", "zalo");

    const claim = await claimRefreshLock(WS_A, "zalo");
    expect(claim.claimed).toBe(true);
  });

  it("allows a new claim after release", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_rel",
      refreshToken: "refresh-1",
    });
    expect((await claimRefreshLock(WS_A, "zalo")).claimed).toBe(true);
    expect((await claimRefreshLock(WS_A, "zalo")).claimed).toBe(false);
    await releaseRefreshLock(WS_A, "zalo");
    expect((await claimRefreshLock(WS_A, "zalo")).claimed).toBe(true);
  });
});
