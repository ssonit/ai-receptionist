import { beforeEach, vi } from "vitest";
import { getMockAdminClient, resetSupabaseMock } from "./helpers/supabase-mock";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: getMockAdminClient,
}));

beforeEach(() => {
  resetSupabaseMock();
});
