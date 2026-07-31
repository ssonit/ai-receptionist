import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  withRetry,
  resetCircuitBreaker,
  CircuitBreakerOpenError,
} from "@/lib/retry";

beforeEach(() => {
  resetCircuitBreaker();
  vi.unstubAllEnvs();
});

describe("withRetry", () => {
  it("returns value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network error, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx error, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cal.com request failed (503)"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on timeout error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cal.com request timed out after 12s"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on ECONNRESET", async () => {
    const err = new Error("socket hang up") as NodeJS.ErrnoException;
    err.code = "ECONNRESET";
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on ETIMEDOUT", async () => {
    const err = new Error("connect ETIMEDOUT") as NodeJS.ErrnoException;
    err.code = "ETIMEDOUT";
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on AbortError", async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    const result = await withRetry(fn, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cal.com request failed (404)"))
      .mockResolvedValue("ok");
    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
      }),
    ).rejects.toThrow("Cal.com request failed (404)");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on generic non-network error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("CALCOM_API_KEY is not configured"))
      .mockResolvedValue("ok");
    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
      }),
    ).rejects.toThrow("CALCOM_API_KEY is not configured");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws last error after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fetch failed"));
    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
      }),
    ).rejects.toThrow("fetch failed");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("circuit breaker", () => {
  it("opens after consecutive failures reach threshold", async () => {
    const attempts: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      attempts.push(1);
      return Promise.reject(new Error("fetch failed"));
    });

    // Exhaust retries once = 3 calls → 3 failures recorded
    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
        circuit: { failureThreshold: 5, resetTimeoutMs: 60_000 },
      }),
    ).rejects.toThrow("fetch failed");

    // Second call exhausts retries = 3 more calls → 6 total failures → circuit opens
    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
        circuit: { failureThreshold: 5, resetTimeoutMs: 60_000 },
      }),
    ).rejects.toThrow("fetch failed");

    // Third call: circuit is open — immediately rejects
    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
        circuit: { failureThreshold: 5, resetTimeoutMs: 60_000 },
      }),
    ).rejects.toThrow(CircuitBreakerOpenError);

    // fn was called exactly 6 times (3 per retry exhaustion × 2 attempts)
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it("resets circuit on success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue("ok");

    // First call: 2 failures then success → circuit resets
    const result1 = await withRetry(fn, {
      retry: { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 10 },
      circuit: { failureThreshold: 5, resetTimeoutMs: 60_000 },
    });
    expect(result1).toBe("ok");

    // Second call: succeeds immediately, circuit is still closed
    const fn2 = vi.fn().mockResolvedValue("ok2");
    const result2 = await withRetry(fn2, {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 },
    });
    expect(result2).toBe("ok2");
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("uses env config for threshold and reset timeout", async () => {
    vi.stubEnv("CAL_CIRCUIT_BREAKER_THRESHOLD", "2");
    vi.stubEnv("CAL_CIRCUIT_BREAKER_RESET_MS", "60000");

    // 2 failures with maxAttempts=2 = 4 failures → threshold is 2, circuit opens
    const fn = vi.fn().mockRejectedValue(new Error("fetch failed"));

    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 10 },
      }),
    ).rejects.toThrow("fetch failed");

    await expect(
      withRetry(fn, {
        retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 10 },
      }),
    ).rejects.toThrow(CircuitBreakerOpenError);
  });
});
