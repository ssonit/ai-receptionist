// lib/cal-webhook-setup.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    listWebhooks: vi.fn(),
    createWebhook: vi.fn(),
  };
});
vi.mock("@/lib/workspace", () => ({
  getCalAccessTokenForWorkspace: vi.fn(),
  ensureWebhookSecret: vi.fn(),
}));
vi.mock("@/lib/app-origin", () => ({
  appOrigin: vi.fn().mockReturnValue("https://tenant.example.com"),
}));

const WS_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("ensureCalWebhookForWorkspace", () => {
  it("skips entirely when cal_webhook_synced_at is already set", async () => {
    supabaseMock.seed("workspaces", [
      { id: WS_ID, cal_webhook_synced_at: "2026-08-01T00:00:00.000Z" },
    ]);
    const calcom = await import("@/lib/calcom");

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result).toEqual({ ok: true, skipped: true });
    expect(calcom.listWebhooks).not.toHaveBeenCalled();
  });

  it("creates a webhook when none exists yet, then marks synced", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const workspaceMod = await import("@/lib/workspace");
    vi.mocked(workspaceMod.getCalAccessTokenForWorkspace).mockResolvedValue("token-abc");
    vi.mocked(workspaceMod.ensureWebhookSecret).mockResolvedValue("secret-xyz");

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.listWebhooks).mockResolvedValue([]);
    vi.mocked(calcom.createWebhook).mockResolvedValue({
      id: "wh_1",
      subscriberUrl: `https://tenant.example.com/api/cal/webhook?workspace_id=${WS_ID}`,
      active: true,
      triggers: [...calcom.CAL_WEBHOOK_TRIGGER_EVENTS],
    });

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result).toEqual({ ok: true, skipped: false });
    expect(calcom.createWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberUrl: `https://tenant.example.com/api/cal/webhook?workspace_id=${WS_ID}`,
        secret: "secret-xyz",
      }),
    );
    const rows = supabaseMock.getRows("workspaces");
    expect(rows[0].cal_webhook_synced_at).toBeTruthy();
  });

  it("does not create a duplicate when subscriberUrl already registered on Cal.com", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const workspaceMod = await import("@/lib/workspace");
    vi.mocked(workspaceMod.getCalAccessTokenForWorkspace).mockResolvedValue("token-abc");
    vi.mocked(workspaceMod.ensureWebhookSecret).mockResolvedValue("secret-xyz");

    const calcom = await import("@/lib/calcom");
    const url = `https://tenant.example.com/api/cal/webhook?workspace_id=${WS_ID}`;
    vi.mocked(calcom.listWebhooks).mockResolvedValue([
      { id: "wh_existing", subscriberUrl: url, active: true, triggers: [] },
    ]);

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result).toEqual({ ok: true, skipped: false });
    expect(calcom.createWebhook).not.toHaveBeenCalled();
    expect(supabaseMock.getRows("workspaces")[0].cal_webhook_synced_at).toBeTruthy();
  });

  it("returns ok:false and does not throw when Cal.com rejects (e.g. missing OAuth scope)", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const workspaceMod = await import("@/lib/workspace");
    vi.mocked(workspaceMod.getCalAccessTokenForWorkspace).mockResolvedValue("token-abc");
    vi.mocked(workspaceMod.ensureWebhookSecret).mockResolvedValue("secret-xyz");

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.listWebhooks).mockRejectedValue(new Error("Cal.com request failed (403)"));

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("403");
    // Not marked synced — next call retries.
    expect(supabaseMock.getRows("workspaces")[0].cal_webhook_synced_at).toBeFalsy();
  });
});
