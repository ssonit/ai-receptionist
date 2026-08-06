/**
 * Typed env validation for boot checks (`.env.local` = active target env).
 *
 * Usage:
 *   npx tsx --env-file=.env.local lib/env.ts
 *   npm run env:check
 *
 * Default: **Supabase Cloud** credentials in `.env.local`. Local Supabase is
 * opt-in only. Canonical keys match Dashboard / new CLI:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * - SUPABASE_SECRET_KEY
 *
 * `lib/supabase/keys.ts` resolves these (with legacy aliases as fallback).
 */
import { z } from "zod";
import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getSupabaseUrl,
} from "@/lib/supabase/keys";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const urlOptional = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const stringOptional = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),

  NEXT_PUBLIC_APP_URL: urlOptional,
  NEXT_PUBLIC_SITE_URL: urlOptional,
  EVE_BASE_URL: urlOptional,

  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: stringOptional,
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: stringOptional,

  WORKSPACE_SECRETS_KEY: stringOptional,
  BOOKING_WORKSPACE_ID: stringOptional,
  NEXT_PUBLIC_BOOKING_WORKSPACE_ID: stringOptional,
});

export type AppEnv = z.infer<typeof envSchema>;

export type EnvCheckResult = {
  ok: boolean;
  env: AppEnv | null;
  errors: string[];
  warnings: string[];
};

function collectRawEnv(): Record<string, string | undefined> {
  return {
    // Resolve via keys helper so legacy ANON / SERVICE_ROLE still pass checks.
    NEXT_PUBLIC_SUPABASE_URL: getSupabaseUrl(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: getSupabasePublishableKey(),
    SUPABASE_SECRET_KEY: getSupabaseSecretKey(),
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    EVE_BASE_URL: process.env.EVE_BASE_URL,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:
      process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:
      process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET,
    WORKSPACE_SECRETS_KEY: process.env.WORKSPACE_SECRETS_KEY,
    BOOKING_WORKSPACE_ID: process.env.BOOKING_WORKSPACE_ID,
    NEXT_PUBLIC_BOOKING_WORKSPACE_ID:
      process.env.NEXT_PUBLIC_BOOKING_WORKSPACE_ID,
  };
}

/** Soft check — never throws; returns structured errors/warnings. */
export function checkEnv(): EnvCheckResult {
  const parsed = envSchema.safeParse(collectRawEnv());
  const warnings: string[] = [];

  if (!parsed.success) {
    return {
      ok: false,
      env: null,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
      warnings,
    };
  }

  const env = parsed.data;

  if (!env.NEXT_PUBLIC_APP_URL && !env.NEXT_PUBLIC_SITE_URL) {
    warnings.push(
      "NEXT_PUBLIC_APP_URL unset — appOrigin() falls back to http://localhost:3000",
    );
  }

  if (
    !env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID ||
    !env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET
  ) {
    warnings.push(
      "Google OAuth secrets unset — enable Google in Supabase Dashboard Auth → Providers and set SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/SECRET (or Dashboard-only config)",
    );
  }

  if (/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
    warnings.push(
      "NEXT_PUBLIC_SUPABASE_URL points at local Supabase — only use this when intentionally running local",
    );
  }

  const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.SUPABASE_SECRET_KEY;
  if (
    !pub.startsWith("sb_publishable_") &&
    !pub.startsWith("eyJ") &&
    !pub.startsWith("sb_")
  ) {
    warnings.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY does not look like sb_publishable_* or a JWT",
    );
  }
  if (secret.startsWith("sb_publishable_") || secret === pub) {
    warnings.push(
      "SUPABASE_SECRET_KEY looks wrong — use sb_secret_* (or legacy service_role JWT), not the publishable key",
    );
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  ) {
    warnings.push(
      "Using legacy NEXT_PUBLIC_SUPABASE_ANON_KEY — prefer NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  if (
    !process.env.SUPABASE_SECRET_KEY?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    warnings.push(
      "Using legacy SUPABASE_SERVICE_ROLE_KEY — prefer SUPABASE_SECRET_KEY",
    );
  }

  return { ok: true, env, errors: [], warnings };
}

/** Throws with a readable message when required env is invalid. */
export function assertEnv(): AppEnv {
  const result = checkEnv();
  if (!result.ok || !result.env) {
    throw new Error(
      `Invalid environment:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
  return result.env;
}

let cached: AppEnv | null = null;

/** Validated env — validates once on first access. */
export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, prop: string) {
    if (!cached) {
      cached = assertEnv();
    }
    return cached[prop as keyof AppEnv];
  },
});

function printCheck(result: EnvCheckResult) {
  if (result.ok) {
    console.log("env:check OK");
    for (const warning of result.warnings) {
      console.warn(`  warn: ${warning}`);
    }
    return;
  }
  console.error("env:check FAILED");
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  for (const warning of result.warnings) {
    console.warn(`  warn: ${warning}`);
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /[/\\]env\.(ts|js|mts|mjs)$/.test(process.argv[1]);

if (isDirectRun) {
  const result = checkEnv();
  printCheck(result);
  process.exit(result.ok ? 0 : 1);
}
