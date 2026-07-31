/**
 * Retry with exponential backoff + jitter, and circuit breaker for Cal.com API.
 * Only wraps network errors and 5xx responses — 4xx errors pass through immediately.
 */

export type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type CircuitBreakerConfig = {
  failureThreshold: number;
  resetTimeoutMs: number;
};

type CircuitState = {
  failures: number;
  openedAt: number | null;
};

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
};

const DEFAULT_CIRCUIT: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
};

function resolveRetryConfig(): RetryConfig {
  return {
    maxAttempts: Number(process.env.CAL_RETRY_MAX_ATTEMPTS) || DEFAULT_RETRY.maxAttempts,
    baseDelayMs: Number(process.env.CAL_RETRY_BASE_DELAY_MS) || DEFAULT_RETRY.baseDelayMs,
    maxDelayMs: Number(process.env.CAL_RETRY_MAX_DELAY_MS) || DEFAULT_RETRY.maxDelayMs,
  };
}

function resolveCircuitConfig(): CircuitBreakerConfig {
  return {
    failureThreshold:
      Number(process.env.CAL_CIRCUIT_BREAKER_THRESHOLD) ||
      DEFAULT_CIRCUIT.failureThreshold,
    resetTimeoutMs:
      Number(process.env.CAL_CIRCUIT_BREAKER_RESET_MS) ||
      DEFAULT_CIRCUIT.resetTimeoutMs,
  };
}

const circuits = new Map<string, CircuitState>();

function getCircuitKey(): string {
  return "calcom";
}

export function resetCircuitBreaker(): void {
  circuits.delete(getCircuitKey());
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const msg = error.message;
    if (msg.includes("Cal.com request failed (5")) return true;
    if (msg.includes("Cal.com request timed out")) return true;
    if (msg.includes("fetch failed") || msg.includes("network")) return true;
    if ((error as NodeJS.ErrnoException).code === "ECONNRESET") return true;
    if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") return true;
    if ((error as NodeJS.ErrnoException).code === "ENOTFOUND") return true;
  }
  return false;
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super("Cal.com circuit breaker is open — service unavailable");
    this.name = "CircuitBreakerOpenError";
  }
}

function checkCircuit(key: string, config: CircuitBreakerConfig): void {
  const state = circuits.get(key);
  if (!state || state.failures < config.failureThreshold) return;

  if (state.openedAt) {
    const elapsed = Date.now() - state.openedAt;
    if (elapsed < config.resetTimeoutMs) {
      throw new CircuitBreakerOpenError();
    }
    // Reset timeout passed — half-open: allow one probe
    circuits.delete(key);
  }
}

function recordCircuitFailure(key: string, config: CircuitBreakerConfig): void {
  const state = circuits.get(key) ?? { failures: 0, openedAt: null };
  state.failures++;
  if (state.failures >= config.failureThreshold) {
    state.openedAt = Date.now();
  }
  circuits.set(key, state);
}

function recordCircuitSuccess(key: string): void {
  circuits.delete(key);
}

function jitter(delayMs: number): number {
  return delayMs + Math.random() * delayMs * 0.3;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retry?: Partial<RetryConfig>; circuit?: Partial<CircuitBreakerConfig> },
): Promise<T> {
  const retryCfg = { ...resolveRetryConfig(), ...opts?.retry };
  const circuitCfg = { ...resolveCircuitConfig(), ...opts?.circuit };
  const key = getCircuitKey();

  checkCircuit(key, circuitCfg);

  let lastError: unknown;

  for (let attempt = 0; attempt < retryCfg.maxAttempts; attempt++) {
    try {
      const result = await fn();
      recordCircuitSuccess(key);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) throw error;

      recordCircuitFailure(key, circuitCfg);

      if (attempt < retryCfg.maxAttempts - 1) {
        const delay = Math.min(
          jitter(retryCfg.baseDelayMs * 2 ** attempt),
          retryCfg.maxDelayMs,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
