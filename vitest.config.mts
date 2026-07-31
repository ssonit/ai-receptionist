import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "agent/**/*.test.ts", "app/api/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".next/**", ".output/**"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
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
    },
    coverage: {
      provider: "v8",
      include: ["lib/**", "agent/date-context.ts", "agent/tools/**"],
      reporter: ["text", "html"],
    },
  },
});
