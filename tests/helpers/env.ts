import { vi } from "vitest";

/** Override env vars, reset module registry, run fn, then restore. Use for modules that read `process.env` at import time (like `booking-config.ts`). */
export async function withEnv<T>(
  env: Record<string, string>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    vi.stubEnv(k, v);
  }
  vi.resetModules();
  try {
    return await fn();
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
    // Restore original values
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}
