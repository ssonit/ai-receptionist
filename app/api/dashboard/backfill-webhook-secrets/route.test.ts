/**
 * Webhook-secret backfill endpoint.
 * Supabase is mocked globally via tests/setup.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../../tests/helpers/supabase-mock";
import { POST } from "./route";

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "test-cron-secret";

function request(authHeader?: string): Request {
  return new Request("http://localhost/api/dashboard/backfill-webhook-secrets", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

function seedWorkspaces() {
  supabaseMock.seed("workspaces", [
    { id: PILOT_ID, name: "Eve Pilot", webhook_secret_encrypted: null },
    { id: TENANT_A, name: "Spa A", webhook_secret_encrypted: null },
    { id: TENANT_B, name: "Clinic B", webhook_secret_encrypted: null },
  ]);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
});

describe("POST /api/dashboard/backfill-webhook-secrets", () => {
  it("rejects an anonymous call", async () => {
    seedWorkspaces();

    const res = await POST(request());

    // /api/dashboard/** is outside the proxy matcher, so this route is the
    // only thing standing between an anonymous POST and every tenant's row.
    expect(res.status).toBe(401);
    expect(supabaseMock.getRows("workspaces").every((w) => !w.webhook_secret_encrypted)).toBe(true);
  });

  it("rejects a wrong bearer token", async () => {
    seedWorkspaces();

    expect((await POST(request("Bearer nope"))).status).toBe(401);
    expect((await POST(request(SECRET))).status).toBe(401);
  });

  it("rejects everything when CRON_SECRET is unset (fail closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    seedWorkspaces();

    expect((await POST(request("Bearer "))).status).toBe(401);
  });

  it("backfills tenants and skips Pilot with a valid token", async () => {
    seedWorkspaces();

    const res = await POST(request(`Bearer ${SECRET}`));
    const body = (await res.json()) as {
      ok: boolean;
      updated: number;
      skipped: number;
      failed: string[];
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, updated: 2, skipped: 1, failed: [] });

    const rows = supabaseMock.getRows("workspaces");
    const byId = (id: string) => rows.find((r) => r.id === id);
    expect(byId(TENANT_A)?.webhook_secret_encrypted).toBeTruthy();
    expect(byId(TENANT_B)?.webhook_secret_encrypted).toBeTruthy();
    // Pilot keeps using the env var.
    expect(byId(PILOT_ID)?.webhook_secret_encrypted).toBeNull();
    // Each tenant gets its own secret — that is the whole point.
    expect(byId(TENANT_A)?.webhook_secret_encrypted).not.toBe(
      byId(TENANT_B)?.webhook_secret_encrypted,
    );
  });

  it("never returns workspace names", async () => {
    seedWorkspaces();

    const raw = await (await POST(request(`Bearer ${SECRET}`))).text();

    expect(raw).not.toContain("Spa A");
    expect(raw).not.toContain("Clinic B");
  });

  it("leaves already-migrated workspaces alone", async () => {
    supabaseMock.seed("workspaces", [
      { id: TENANT_A, name: "Spa A", webhook_secret_encrypted: "already-set" },
    ]);

    const body = (await (await POST(request(`Bearer ${SECRET}`))).json()) as {
      updated: number;
    };

    expect(body.updated).toBe(0);
    expect(supabaseMock.getRows("workspaces")[0].webhook_secret_encrypted).toBe(
      "already-set",
    );
  });
});
