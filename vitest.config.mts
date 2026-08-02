import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";

/** Read the current local service-role key from a running Supabase stack. */
function getLocalServiceRoleKey(): string {
  try {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = out.match(/^SERVICE_ROLE_KEY=(.+)$/m);
    if (!match) return "";
    return match[1].replace(/^"|"$/g, "");
  } catch {
    return "";
  }
}

const localServiceRoleKey = getLocalServiceRoleKey();

const sharedTestEnv = {
  NODE_ENV: "test",
  BILLING_MODE: "test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
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
};

const sharedInclude = [
  "lib/**/*.test.ts",
  "agent/**/*.test.ts",
  "app/api/**/*.test.ts",
  "tests/**/*.test.ts",
];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
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
          ],
          setupFiles: ["./tests/setup.ts"],
          env: {
            ...sharedTestEnv,
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "db-integration",
          environment: "node",
          globals: false,
          include: ["lib/channel-connections.test.ts"],
          setupFiles: [],
          env: {
            ...sharedTestEnv,
            SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey || "test-service-role-key",
          },
        },
      },
    ],
  },
});
