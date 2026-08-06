import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";

/** Read a local secret key from a running Supabase stack (JWT or sb_secret). */
function getLocalSecretKey(): string {
  try {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const secret = out.match(/^SECRET_KEY=(.+)$/m);
    if (secret) return secret[1].replace(/^"|"$/g, "");
    const service = out.match(/^SERVICE_ROLE_KEY=(.+)$/m);
    if (service) return service[1].replace(/^"|"$/g, "");
    return "";
  } catch {
    return "";
  }
}

const localSecretKey = getLocalSecretKey();

const sharedTestEnv = {
  NODE_ENV: "test",
  BILLING_MODE: "test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SECRET_KEY: "test-secret-key",
  CALCOM_API_KEY: "test-cal-api-key",
  CALCOM_API_BASE_URL: "https://api.cal.com/v2",
  CALCOM_EVENT_TYPE_ID: "1",
  CALCOM_EVENT_TYPE_SLUG: "consultation-30",
  CALCOM_USERNAME: "test-cal-user",
  BOOKING_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
  NEXT_PUBLIC_BOOKING_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
  BOOKING_TIMEZONE: "Asia/Ho_Chi_Minh",
  BOOKING_MIN_NOTICE_HOURS: "2",
  BOOKING_MANAGE_CODE_PEPPER: "test-manage-code-pepper",
  WORKSPACE_SECRETS_KEY: "test-workspace-secrets-key-0123456789abcdef",
  BOOKING_SYNC_PAGE_LIMIT: "100",
  BOOKING_SYNC_MAX_PAGES: "10",
  ZALO_APP_ID: "test-zalo-app-id",
  ZALO_APP_SECRET: "test-zalo-app-secret",
  ZALO_OA_SECRET_KEY: "test-zalo-oa-secret",
  ZALO_REDIRECT_URI: "http://localhost:3000/api/zalo/oauth/callback",
  META_APP_SECRET: "test-messenger-app-secret",
  MESSENGER_VERIFY_TOKEN: "test-messenger-verify-token",
};

const sharedInclude = [
  "lib/**/*.test.ts",
  "agent/**/*.test.ts",
  "app/api/**/*.test.ts",
  "app/dashboard/**/*.test.ts",
  "tests/**/*.test.ts",
];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Vitest's 5s default is too tight for this suite. Several files open with
    // a dynamic `await import()` of a heavy module (agent instructions, the
    // agent tools, workspace-oauth); alone each takes ~2s, but with 55 files
    // running in parallel that first import regularly crossed 5s and failed
    // eight files on timeout — never on an assertion, and never when the file
    // was run on its own. Inherited by both projects via `extends: true`.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["lib/**", "agent/date-context.ts", "agent/tools/**"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          globals: false,
          include: sharedInclude,
          exclude: [
            "node_modules/**",
            "dist/**",
            ".next/**",
            ".output/**",
            "lib/channel-connections.test.ts",
            "lib/zalo-oauth-refresh.test.ts",
            "tests/handle-new-user-oauth-invite.test.ts",
            "tests/db/**",
          ],
          setupFiles: ["./tests/setup.ts"],
          env: {
            ...sharedTestEnv,
            SUPABASE_SECRET_KEY: "test-secret-key",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "db-integration",
          environment: "node",
          globals: false,
          include: [
            "lib/channel-connections.test.ts",
            "lib/zalo-oauth-refresh.test.ts",
            "tests/handle-new-user-oauth-invite.test.ts",
            "tests/db/**/*.test.ts",
          ],
          setupFiles: [],
          env: {
            ...sharedTestEnv,
            SUPABASE_SECRET_KEY: localSecretKey || "test-secret-key",
          },
        },
      },
    ],
  },
});
