/**
 * cal-oauth-state unit tests — sign/verify round-trip, tamper/expiry/workspace mismatch.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Freeze time for deterministic expiry tests.
const NOW = 1753992000000; // 2026-07-31T12:00:00.000Z

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cal-oauth-state", () => {
  it("creates and verifies a state token", async () => {
    const { createOAuthState, parseOAuthState } = await import("./cal-oauth-state");
    const { token, payload } = createOAuthState("ws-1", "/dashboard/setup");

    expect(token).toBeTruthy();
    expect(payload.workspaceId).toBe("ws-1");
    expect(payload.returnTo).toBe("/dashboard/setup");
    expect(payload.nonce).toHaveLength(32); // 16 bytes hex
    expect(payload.exp).toBeGreaterThan(NOW);

    const verified = parseOAuthState(token, "ws-1");
    expect(verified).not.toBeNull();
    expect(verified!.workspaceId).toBe("ws-1");
    expect(verified!.returnTo).toBe("/dashboard/setup");
  });

  it("rejects tampered state token", async () => {
    const { createOAuthState, parseOAuthState } = await import("./cal-oauth-state");
    const { token } = createOAuthState("ws-1", "/dashboard/setup");

    // Flip a bit in the payload portion
    const parts = token.split(".");
    const tamperedPayload = parts[0]!.slice(0, -1) + (parts[0]!.endsWith("A") ? "B" : "A");
    const tampered = `${tamperedPayload}.${parts[1]}`;

    expect(parseOAuthState(tampered, "ws-1")).toBeNull();
  });

  it("rejects expired state token", async () => {
    const { createOAuthState, parseOAuthState } = await import("./cal-oauth-state");
    const { token } = createOAuthState("ws-1", "/dashboard/setup");

    // Advance past TTL (10 min + 1 ms)
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(parseOAuthState(token, "ws-1")).toBeNull();
  });

  it("accepts token just before expiry", async () => {
    const { createOAuthState, parseOAuthState } = await import("./cal-oauth-state");
    const { token } = createOAuthState("ws-1", "/dashboard/setup");

    vi.advanceTimersByTime(9 * 60 * 1000);

    expect(parseOAuthState(token, "ws-1")).not.toBeNull();
  });

  it("rejects token for wrong workspace", async () => {
    const { createOAuthState, parseOAuthState } = await import("./cal-oauth-state");
    const { token } = createOAuthState("ws-1", "/dashboard/setup");

    expect(parseOAuthState(token, "ws-2")).toBeNull();
  });

  it("rejects token with corrupted signature", async () => {
    const { createOAuthState, parseOAuthState } = await import("./cal-oauth-state");
    const { token } = createOAuthState("ws-1", "/dashboard/setup");

    const parts = token.split(".");
    const corrupted = `${parts[0]}.${parts[1]!.slice(0, -2)}xx`;

    expect(parseOAuthState(corrupted, "ws-1")).toBeNull();
  });

  it("rejects garbage input", async () => {
    const { parseOAuthState } = await import("./cal-oauth-state");
    expect(parseOAuthState("not-a-token", "ws-1")).toBeNull();
    expect(parseOAuthState("", "ws-1")).toBeNull();
    expect(parseOAuthState("a.b.c", "ws-1")).toBeNull();
  });

  it("defaults returnTo when not starting with /", async () => {
    const { createOAuthState } = await import("./cal-oauth-state");
    const { payload } = createOAuthState("ws-1", "dashboard/setup");
    expect(payload.returnTo).toBe("/dashboard/setup");
  });
});
