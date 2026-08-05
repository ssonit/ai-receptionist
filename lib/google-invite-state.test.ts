/**
 * google-invite-state unit tests — sign/verify round-trip, tamper/expiry.
 * Mirrors lib/cal-oauth-state.test.ts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const NOW = 1754400000000; // fixed instant for deterministic expiry tests

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("google-invite-state", () => {
  it("creates and verifies a state token", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token, payload } = createGoogleInviteState(
      "invite-token-abc",
      "/invite/invite-token-abc",
    );

    expect(token).toBeTruthy();
    expect(payload.inviteToken).toBe("invite-token-abc");
    expect(payload.next).toBe("/invite/invite-token-abc");
    expect(payload.nonce).toHaveLength(32); // 16 bytes hex
    expect(payload.exp).toBeGreaterThan(NOW);

    const verified = parseGoogleInviteState(token);
    expect(verified).not.toBeNull();
    expect(verified!.inviteToken).toBe("invite-token-abc");
    expect(verified!.next).toBe("/invite/invite-token-abc");
  });

  it("rejects tampered state token", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    const parts = token.split(".");
    const tamperedPayload =
      parts[0]!.slice(0, -1) + (parts[0]!.endsWith("A") ? "B" : "A");
    const tampered = `${tamperedPayload}.${parts[1]}`;

    expect(parseGoogleInviteState(tampered)).toBeNull();
  });

  it("rejects expired state token", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(parseGoogleInviteState(token)).toBeNull();
  });

  it("accepts token just before expiry", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    vi.advanceTimersByTime(9 * 60 * 1000);

    expect(parseGoogleInviteState(token)).not.toBeNull();
  });

  it("rejects token with corrupted signature", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    const parts = token.split(".");
    const corrupted = `${parts[0]}.${parts[1]!.slice(0, -2)}xx`;

    expect(parseGoogleInviteState(corrupted)).toBeNull();
  });

  it("rejects garbage input", async () => {
    const { parseGoogleInviteState } = await import("./google-invite-state");
    expect(parseGoogleInviteState("not-a-token")).toBeNull();
    expect(parseGoogleInviteState("")).toBeNull();
    expect(parseGoogleInviteState("a.b.c")).toBeNull();
  });
});
