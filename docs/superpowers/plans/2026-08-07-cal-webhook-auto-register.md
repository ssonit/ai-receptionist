# Cal.com Webhook Auto-Registration Implementation Plan

> **For agentic workers:** **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy (tiền lệ: `docs/superpowers/plans/2026-07-26-cal-key-tool-errors.md`). Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`. Đổi lại: **commit từng task một**, message rõ ràng — đó là cách quay lui khi hỏng (`git revert <sha>`). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng ký webhook Cal.com tự động lúc workspace connect (API key hoặc OAuth) — không còn để chủ tiệm tự dán URL+secret — với cơ chế tự phục hồi (retry) không cần cron nếu lần đăng ký đầu thất bại; đồng thời sửa 1 gap idempotency (analytics đếm trùng khi Cal.com gửi lại webhook).

**Architecture:** `ensureCalWebhookForWorkspace()` (file mới `lib/cal-webhook-setup.ts`) là hàm điều phối duy nhất: kiểm tra cột `workspaces.cal_webhook_synced_at`, nếu chưa xong thì lấy Bearer token qua `getCalAccessTokenForWorkspace` (đã hỗ trợ cả api_key lẫn oauth), gọi 2 hàm mới trong `lib/calcom.ts` (`listWebhooks`/`createWebhook`) để đăng ký, rồi set cột đó. Hàm này được gọi từ đúng 1 chỗ dùng chung: đầu `syncCalBookingsToSupabase()` — nghĩa là mọi call site đã gọi hàm đó (OAuth callback, save API key, nút "Resync" thủ công) tự động có khả năng đăng ký + tự retry, không cần sửa từng nơi riêng lẻ.

**Tech Stack:** Next.js route handlers + server actions, Supabase (Postgres), vitest + `tests/helpers/supabase-mock.ts`.

## Global Constraints

- **Không tạo branch/worktree, commit từng task, thẳng vào `main`** (xem header).
- Test runner: `vitest` (`npm run test` = `vitest run`). Repo CÓ test runner — bỏ qua bất kỳ ghi chú cũ nào nói "no test runner" (đã lỗi thời, xác nhận lại `package.json:28`).
- Test file đặt cạnh file nguồn (`lib/foo.ts` → `lib/foo.test.ts`, `app/api/x/route.ts` → `app/api/x/route.test.ts`) — đúng vị trí `lib/booking-reminders.test.ts`, `app/api/dashboard/backfill-webhook-secrets/route.test.ts` đã có, không dùng thư mục `tests/` cho các file này (`tests/` dành cho agent-tools + db integration, khác nhóm).
- Tenant luôn qua `workspaceId` tường minh — không fallback Pilot ngầm định. `getCalAccessTokenForWorkspace`/`ensureWebhookSecret` đã tự lo việc này, không viết lại.
- Không sửa `lib/workspace.ts`, không sửa `lib/cal-oauth.ts` — cả hai đã đúng, chỉ **dùng** chúng.
- Sau mỗi task sửa code: `graphify update .`.
- Sau task sửa `.tsx`: `npm run doctor` (react-doctor scope changed) — sửa lỗi trước khi coi task xong.
- Copy UI trong `webhook-secret-card.tsx` giữ tiếng Anh — khớp quy ước hiện có của chính file đó, không thêm i18n mới ngoài phạm vi.
- Nguồn: spec đã duyệt tại `docs/superpowers/specs/2026-08-07-cal-webhook-auto-register-design.md`.

---

### Task 1: Migration — cột `cal_webhook_synced_at`

**Files:**
- Create: `supabase/migrations/20260807000000_cal_webhook_synced_at.sql`

**Interfaces:**
- Produces: cột `public.workspaces.cal_webhook_synced_at` (`timestamptz`, null mặc định) — Task 3 đọc/ghi cột này.

- [ ] **Bước 1: Xác nhận timestamp migration mới nhất chưa bị trùng**

```bash
ls supabase/migrations | tail -5
```

Timestamp file mới (`20260807000000`) phải đứng sau file cuối cùng trong danh sách. Nếu đã có file `20260807000000_*` khác, đổi giờ/phút cho không trùng.

- [ ] **Bước 2: Viết migration**

```sql
-- Cổng rẻ cho việc tự đăng ký lại webhook Cal.com: NULL nghĩa là
-- "ensureCalWebhookForWorkspace() còn cần chạy", set lúc thành công (đăng ký
-- mới hoặc đã có sẵn) để các lần gọi sau bỏ qua round-trip listWebhooks.
alter table public.workspaces
  add column if not exists cal_webhook_synced_at timestamptz;

comment on column public.workspaces.cal_webhook_synced_at is
  'Last time ensureCalWebhookForWorkspace() confirmed the Cal.com webhook is registered. NULL = needs (re)registration.';
```

Không cần đổi RLS — cột mới nằm trên bảng `workspaces` đã có policy theo `workspace_id`, không phải secret (không cần mã hoá, không cần ẩn khỏi `authenticated` SELECT).

- [ ] **Bước 3: Áp migration cục bộ, xác nhận không lỗi**

```bash
npx supabase db reset
```

Kỳ vọng: chạy xong không lỗi, `\d public.workspaces` (hoặc Supabase Studio) thấy cột mới.

- [ ] **Bước 4: Commit**

```bash
git add supabase/migrations/20260807000000_cal_webhook_synced_at.sql
git commit -m "feat(db): add workspaces.cal_webhook_synced_at for webhook auto-register retry gate"
```

---

### Task 2: `lib/calcom.ts` — `listWebhooks()` + `createWebhook()`

**Files:**
- Modify: `lib/calcom.ts`

**Interfaces:**
- Consumes: `calFetch<T>(path, init)`, `requireCalApiKey()` (nội bộ file, đã có).
- Produces: `CalWebhook` type, `CAL_WEBHOOK_TRIGGER_EVENTS: readonly string[]`, `listWebhooks(): Promise<CalWebhook[]>`, `createWebhook(input: CreateWebhookInput): Promise<CalWebhook>` — Task 3 và Task 5 import các export này.

**Không viết test file riêng cho bước này** — đúng quy ước đã có trong file: `getAvailableSlots`/`createBooking`/`createEventType` không có test trực tiếp (không có `lib/calcom.test.ts`), chỉ được test gián tiếp qua nơi gọi chúng với `vi.mock("@/lib/calcom", ...)` (xem `tests/agent-tools/book_appointment.test.ts:15-22`). `listWebhooks`/`createWebhook` được test gián tiếp ở Task 3.

- [ ] **Bước 1: Thêm type + hằng số + 2 hàm**

Thêm vào cuối `lib/calcom.ts` (sau `fetchAllCalBookings`, cùng khu vực các hàm `/v2/...` khác):

```ts
export type CalWebhook = {
  id: string;
  subscriberUrl: string;
  active: boolean;
  triggers: string[];
};

export type CreateWebhookInput = {
  subscriberUrl: string;
  secret: string;
  triggers: readonly string[];
};

/**
 * Same trigger set app/api/cal/webhook/route.ts filters on — single source
 * so registration and the receiving route can never drift apart.
 */
export const CAL_WEBHOOK_TRIGGER_EVENTS = [
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
  "BOOKING_REQUESTED",
  "BOOKING_NO_SHOW",
] as const;

// Unconfirmed against a live Cal.com account as of this plan — verify in
// Task 7 and correct here if Cal.com's response indicates a different
// version is expected for /v2/webhooks specifically.
const WEBHOOKS_API_VERSION = "2024-08-13";

function parseCalWebhook(item: Record<string, unknown>): CalWebhook | null {
  if (typeof item.id !== "string" && typeof item.id !== "number") return null;
  if (typeof item.subscriberUrl !== "string") return null;
  return {
    id: String(item.id),
    subscriberUrl: item.subscriberUrl,
    active: Boolean(item.active),
    triggers: Array.isArray(item.triggers) ? (item.triggers as string[]) : [],
  };
}

/** GET /v2/webhooks — account-level, all event types. */
export async function listWebhooks(): Promise<CalWebhook[]> {
  requireCalApiKey();
  const body = await calFetch<{ data?: unknown } | unknown[]>("/webhooks", {
    method: "GET",
    apiVersion: WEBHOOKS_API_VERSION,
  });

  const rawList = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: unknown[] }).data)
      : [];

  const out: CalWebhook[] = [];
  for (const item of rawList) {
    if (item && typeof item === "object") {
      const parsed = parseCalWebhook(item as Record<string, unknown>);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

/** POST /v2/webhooks — account-level, all event types. */
export async function createWebhook(input: CreateWebhookInput): Promise<CalWebhook> {
  requireCalApiKey();
  const payload = {
    subscriberUrl: input.subscriberUrl,
    active: true,
    triggers: input.triggers,
    secret: input.secret,
  };

  const body = await calFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    "/webhooks",
    {
      method: "POST",
      apiVersion: WEBHOOKS_API_VERSION,
      body: JSON.stringify(payload),
    },
  );

  const data = (body.data ?? body) as Record<string, unknown>;
  const parsed = parseCalWebhook(data);
  if (!parsed) {
    throw new Error("Cal.com create webhook response missing id/subscriberUrl");
  }
  return parsed;
}
```

- [ ] **Bước 2: Typecheck**

```bash
npm run typecheck
```

Kỳ vọng: exit 0.

- [ ] **Bước 3: Cập nhật `app/api/cal/webhook/route.ts` dùng chung hằng số**

Thay khối `RELEVANT_EVENTS` cục bộ (dòng 14-21):

```ts
const RELEVANT_EVENTS = new Set([
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
  "BOOKING_REQUESTED",
  "BOOKING_NO_SHOW",
]);
```

bằng:

```ts
import { CAL_WEBHOOK_TRIGGER_EVENTS } from "@/lib/calcom";

const RELEVANT_EVENTS = new Set(CAL_WEBHOOK_TRIGGER_EVENTS);
```

- [ ] **Bước 4: Typecheck lại + test hiện có không vỡ**

```bash
npm run typecheck
npm run test -- app/api/cal
```

Kỳ vọng: exit 0 cả hai (không có test file cho route này trước Task 5, lệnh thứ hai có thể báo "no test files" — vẫn OK).

- [ ] **Bước 5: Commit**

```bash
git add lib/calcom.ts app/api/cal/webhook/route.ts
git commit -m "feat(calcom): add listWebhooks/createWebhook, share trigger-event constant"
```

---

### Task 3: `lib/cal-webhook-setup.ts` — `ensureCalWebhookForWorkspace()`

**Files:**
- Create: `lib/cal-webhook-setup.ts`
- Test: `lib/cal-webhook-setup.test.ts`

**Interfaces:**
- Consumes: `listWebhooks()`, `createWebhook()`, `CAL_WEBHOOK_TRIGGER_EVENTS`, `withCalApiKey()` (Task 2 + existing, tất cả từ `@/lib/calcom`); `getCalAccessTokenForWorkspace(workspaceId): Promise<string>`, `ensureWebhookSecret(workspaceId): Promise<string>` (đã có, `@/lib/workspace`); `appOrigin(): string` (đã có, `@/lib/app-origin`); `createAdminClient()` (đã có, `@/lib/supabase/admin`).
- Produces: `ensureCalWebhookForWorkspace(workspaceId: string): Promise<{ ok: true; skipped: boolean } | { ok: false; error: string }>` — Task 4 gọi hàm này, không throw ra ngoài.

- [ ] **Bước 1: Viết test trước (thất bại vì file chưa tồn tại)**

```ts
// lib/cal-webhook-setup.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    listWebhooks: vi.fn(),
    createWebhook: vi.fn(),
  };
});
vi.mock("@/lib/workspace", () => ({
  getCalAccessTokenForWorkspace: vi.fn(),
  ensureWebhookSecret: vi.fn(),
}));
vi.mock("@/lib/app-origin", () => ({
  appOrigin: vi.fn().mockReturnValue("https://tenant.example.com"),
}));

const WS_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("ensureCalWebhookForWorkspace", () => {
  it("skips entirely when cal_webhook_synced_at is already set", async () => {
    supabaseMock.seed("workspaces", [
      { id: WS_ID, cal_webhook_synced_at: "2026-08-01T00:00:00.000Z" },
    ]);
    const calcom = await import("@/lib/calcom");

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result).toEqual({ ok: true, skipped: true });
    expect(calcom.listWebhooks).not.toHaveBeenCalled();
  });

  it("creates a webhook when none exists yet, then marks synced", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const workspaceMod = await import("@/lib/workspace");
    vi.mocked(workspaceMod.getCalAccessTokenForWorkspace).mockResolvedValue("token-abc");
    vi.mocked(workspaceMod.ensureWebhookSecret).mockResolvedValue("secret-xyz");

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.listWebhooks).mockResolvedValue([]);
    vi.mocked(calcom.createWebhook).mockResolvedValue({
      id: "wh_1",
      subscriberUrl: `https://tenant.example.com/api/cal/webhook?workspace_id=${WS_ID}`,
      active: true,
      triggers: [...calcom.CAL_WEBHOOK_TRIGGER_EVENTS],
    });

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result).toEqual({ ok: true, skipped: false });
    expect(calcom.createWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberUrl: `https://tenant.example.com/api/cal/webhook?workspace_id=${WS_ID}`,
        secret: "secret-xyz",
      }),
    );
    const rows = supabaseMock.getRows("workspaces");
    expect(rows[0].cal_webhook_synced_at).toBeTruthy();
  });

  it("does not create a duplicate when subscriberUrl already registered on Cal.com", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const workspaceMod = await import("@/lib/workspace");
    vi.mocked(workspaceMod.getCalAccessTokenForWorkspace).mockResolvedValue("token-abc");
    vi.mocked(workspaceMod.ensureWebhookSecret).mockResolvedValue("secret-xyz");

    const calcom = await import("@/lib/calcom");
    const url = `https://tenant.example.com/api/cal/webhook?workspace_id=${WS_ID}`;
    vi.mocked(calcom.listWebhooks).mockResolvedValue([
      { id: "wh_existing", subscriberUrl: url, active: true, triggers: [] },
    ]);

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result).toEqual({ ok: true, skipped: false });
    expect(calcom.createWebhook).not.toHaveBeenCalled();
    expect(supabaseMock.getRows("workspaces")[0].cal_webhook_synced_at).toBeTruthy();
  });

  it("returns ok:false and does not throw when Cal.com rejects (e.g. missing OAuth scope)", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const workspaceMod = await import("@/lib/workspace");
    vi.mocked(workspaceMod.getCalAccessTokenForWorkspace).mockResolvedValue("token-abc");
    vi.mocked(workspaceMod.ensureWebhookSecret).mockResolvedValue("secret-xyz");

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.listWebhooks).mockRejectedValue(new Error("Cal.com request failed (403)"));

    const { ensureCalWebhookForWorkspace } = await import("./cal-webhook-setup");
    const result = await ensureCalWebhookForWorkspace(WS_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("403");
    // Not marked synced — next call retries.
    expect(supabaseMock.getRows("workspaces")[0].cal_webhook_synced_at).toBeFalsy();
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận thất bại đúng lý do (module chưa tồn tại)**

```bash
npm run test -- lib/cal-webhook-setup.test.ts
```

Kỳ vọng: FAIL — `Cannot find module './cal-webhook-setup'`.

- [ ] **Bước 3: Viết `lib/cal-webhook-setup.ts`**

```ts
import {
  CAL_WEBHOOK_TRIGGER_EVENTS,
  createWebhook,
  listWebhooks,
  withCalApiKey,
} from "@/lib/calcom";
import { appOrigin } from "@/lib/app-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWebhookSecret, getCalAccessTokenForWorkspace } from "@/lib/workspace";

export type EnsureCalWebhookResult =
  | { ok: true; skipped: boolean }
  | { ok: false; error: string };

/**
 * Best-effort, non-fatal: registers this workspace's Cal.com webhook if it
 * isn't already, using whatever credential is available (API key or OAuth
 * via getCalAccessTokenForWorkspace). Never throws — callers get a result,
 * not an exception, because sync/connect flows must not break if Cal.com
 * rejects webhook creation (e.g. missing OAuth scope, see spec section 5).
 *
 * Retry story: this runs every time syncCalBookingsToSupabase() runs (OAuth
 * callback, API-key save, and the dashboard's manual "Resync" button all
 * call it) — cal_webhook_synced_at only advances past NULL on success, so a
 * transient failure self-heals on the next of those calls without a cron.
 */
export async function ensureCalWebhookForWorkspace(
  workspaceId: string,
): Promise<EnsureCalWebhookResult> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("workspaces")
    .select("cal_webhook_synced_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (data?.cal_webhook_synced_at) {
    return { ok: true, skipped: true };
  }

  try {
    const token = await getCalAccessTokenForWorkspace(workspaceId);
    const secret = await ensureWebhookSecret(workspaceId);
    const subscriberUrl = `${appOrigin()}/api/cal/webhook?workspace_id=${workspaceId}`;

    await withCalApiKey(token, async () => {
      const existing = await listWebhooks();
      const alreadyRegistered = existing.some(
        (w) => w.subscriberUrl === subscriberUrl,
      );
      if (!alreadyRegistered) {
        await createWebhook({
          subscriberUrl,
          secret,
          triggers: CAL_WEBHOOK_TRIGGER_EVENTS,
        });
      }
    });

    await supabase
      .from("workspaces")
      .update({ cal_webhook_synced_at: new Date().toISOString() })
      .eq("id", workspaceId);

    return { ok: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook registration failed";
    console.error("[cal-webhook-setup] ensure failed", workspaceId, message);
    return { ok: false, error: message };
  }
}
```

- [ ] **Bước 4: Chạy lại test**

```bash
npm run test -- lib/cal-webhook-setup.test.ts
```

Kỳ vọng: PASS cả 4 case.

- [ ] **Bước 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Bước 6: `graphify update .` + commit**

```bash
graphify update .
git add lib/cal-webhook-setup.ts lib/cal-webhook-setup.test.ts graphify-out
git commit -m "feat(calcom): auto-register workspace webhook with retry-safe gate column"
```

---

### Task 4: Gọi từ `syncCalBookingsToSupabase()`

**Files:**
- Modify: `lib/sync-cal-bookings.ts`
- Test: `lib/sync-cal-bookings.test.ts` (file mới — chưa tồn tại; chỉ thêm case liên quan tới bước này, không viết lại toàn bộ hành vi sync đã có)

**Interfaces:**
- Consumes: `ensureCalWebhookForWorkspace(workspaceId)` (Task 3).
- Produces: không export mới — `syncCalBookingsToSupabase()` giữ nguyên chữ ký.

- [ ] **Bước 1: Viết test cho hành vi mới (thất bại — chưa hook vào)**

```ts
// lib/sync-cal-bookings.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/cal-webhook-setup", () => ({
  ensureCalWebhookForWorkspace: vi.fn().mockResolvedValue({ ok: true, skipped: false }),
}));
vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    fetchAllCalBookings: vi.fn().mockResolvedValue({
      items: [],
      scope: { truncatedFilters: [], pageLimit: 100, maxPages: 1 },
    }),
    withCalApiKey: (_key: string, fn: () => unknown) => fn(),
  };
});
vi.mock("@/lib/workspace", () => ({
  getCalApiKeyForWorkspace: vi.fn().mockResolvedValue("test-key"),
}));

const WS_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("syncCalBookingsToSupabase — webhook registration hook", () => {
  it("calls ensureCalWebhookForWorkspace before fetching bookings", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);

    const { syncCalBookingsToSupabase } = await import("./sync-cal-bookings");
    const webhookSetup = await import("@/lib/cal-webhook-setup");

    await syncCalBookingsToSupabase(WS_ID);

    expect(webhookSetup.ensureCalWebhookForWorkspace).toHaveBeenCalledWith(WS_ID);
  });

  it("still syncs bookings even when webhook registration fails", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, cal_webhook_synced_at: null }]);
    const webhookSetup = await import("@/lib/cal-webhook-setup");
    vi.mocked(webhookSetup.ensureCalWebhookForWorkspace).mockRejectedValue(
      new Error("boom"),
    );

    const { syncCalBookingsToSupabase } = await import("./sync-cal-bookings");
    const result = await syncCalBookingsToSupabase(WS_ID);

    // No throw escaped, and the rest of the function still ran (synced: 0,
    // no error — the calcom mock above returns an empty page).
    expect(result.synced).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận thất bại (chưa gọi hàm mới)**

```bash
npm run test -- lib/sync-cal-bookings.test.ts
```

Kỳ vọng: FAIL ở `expect(webhookSetup.ensureCalWebhookForWorkspace).toHaveBeenCalledWith`.

- [ ] **Bước 3: Hook vào `syncCalBookingsToSupabase()`**

Trong `lib/sync-cal-bookings.ts`, thêm import ở đầu file:

```ts
import { ensureCalWebhookForWorkspace } from "@/lib/cal-webhook-setup";
```

Sửa đầu hàm `syncCalBookingsToSupabase` (ngay sau khối `if (!wsId) { ... }`, trước `let apiKey`):

```ts
  // Best-effort — never let a webhook-registration hiccup block the sync
  // this call actually asked for.
  await ensureCalWebhookForWorkspace(wsId).catch((error) => {
    console.error("[sync-cal-bookings] ensureCalWebhookForWorkspace failed", wsId, error);
  });
```

- [ ] **Bước 4: Chạy lại test**

```bash
npm run test -- lib/sync-cal-bookings.test.ts
```

Kỳ vọng: PASS cả 2 case.

- [ ] **Bước 5: Chạy toàn bộ test suite để chắc không vỡ nơi khác gọi `syncCalBookingsToSupabase`**

```bash
npm run test
```

Kỳ vọng: exit 0. Nếu có test khác gọi `syncCalBookingsToSupabase` mà chưa mock `@/lib/cal-webhook-setup`, nó sẽ thất bại vì đụng Supabase thật qua `createAdminClient` bên trong `ensureCalWebhookForWorkspace` — thêm mock tương tự Bước 1 vào file đó.

- [ ] **Bước 6: `graphify update .` + commit**

```bash
graphify update .
git add lib/sync-cal-bookings.ts lib/sync-cal-bookings.test.ts graphify-out
git commit -m "feat(calcom): retry webhook registration on every sync call (OAuth callback, API-key save, manual Resync)"
```

---

### Task 5: Idempotency — chuyển analytics vào `upsertCalBookings`

**Files:**
- Modify: `app/api/cal/webhook/route.ts`
- Modify: `lib/sync-cal-bookings.ts`
- Test: `app/api/cal/webhook/route.test.ts` (file mới)

**Interfaces:**
- Consumes: `ANALYTICS_EVENT`, `trackServer` (đã có, `@/lib/analytics-events` + `@/lib/analytics-server`).
- Produces: không export mới.

- [ ] **Bước 1: Viết test trước — gửi cùng 1 webhook 2 lần, mong chỉ 1 analytics event**

```ts
// app/api/cal/webhook/route.test.ts
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../../tests/helpers/supabase-mock";
import { POST } from "./route";

vi.mock("@/lib/analytics-server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notification-digests", () => ({
  ensureDigestNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
// getWebhookSecretForWorkspace decrypts a real column — stub it directly so
// the fixture secret below doesn't need real AES-GCM ciphertext.
vi.mock("@/lib/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace")>();
  return { ...actual, getWebhookSecretForWorkspace: vi.fn().mockResolvedValue(SECRET) };
});

const WS_ID = "33333333-3333-4333-8333-333333333333";
const SECRET = "test-webhook-secret";
const BOOKING_UID = "cal_uid_dup_1";

function signedRequest(body: string, secret: string): NextRequest {
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return new NextRequest(
    `http://localhost/api/cal/webhook?workspace_id=${WS_ID}`,
    {
      method: "POST",
      headers: { "x-cal-signature-256": sig },
      body,
    },
  );
}

function cancelledPayload() {
  return JSON.stringify({
    triggerEvent: "BOOKING_CANCELLED",
    payload: {
      uid: BOOKING_UID,
      startTime: "2026-08-10T09:00:00.000Z",
      status: "CANCELLED",
      attendees: [{ name: "Guest", email: "guest@example.com" }],
    },
  });
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  supabaseMock.seed("workspaces", [
    { id: WS_ID, webhook_secret_encrypted: "irrelevant-mocked-decrypt" },
  ]);
  supabaseMock.seed("bookings", [
    {
      id: "booking-row-1",
      workspace_id: WS_ID,
      cal_booking_uid: BOOKING_UID,
      status: "confirmed",
      start_time: "2026-08-10T09:00:00.000Z",
      guest_name: "Guest",
      guest_email: "guest@example.com",
    },
  ]);
});

describe("POST /api/cal/webhook — idempotent analytics", () => {
  it("fires BOOKING_CANCELLED_BY_GUEST exactly once across two identical deliveries", async () => {
    const analytics = await import("@/lib/analytics-server");
    const body = cancelledPayload();

    await POST(signedRequest(body, SECRET));
    await POST(signedRequest(body, SECRET));

    const cancelCalls = vi
      .mocked(analytics.trackServer)
      .mock.calls.filter(([event]) => event === "booking_cancelled_by_guest");
    expect(cancelCalls.length).toBe(1);
  });
});
```

Điều chỉnh tên sự kiện `"booking_cancelled_by_guest"` theo đúng giá trị thật của `ANALYTICS_EVENT.BOOKING_CANCELLED_BY_GUEST` — kiểm tra `lib/analytics-events.ts` trước khi chạy, sửa literal cho khớp nếu khác.

- [ ] **Bước 2: Chạy test, xác nhận thất bại (hiện tại bắn 2 lần)**

```bash
npm run test -- app/api/cal/webhook/route.test.ts
```

Kỳ vọng: FAIL — `cancelCalls.length` là `2`, không phải `1`.

- [ ] **Bước 3: Bỏ 2 lệnh `trackServer` khỏi `processEvent()` trong route**

Trong `app/api/cal/webhook/route.ts`, xoá khối (dòng ~74-87):

```ts
  if (event.triggerEvent === "BOOKING_CANCELLED") {
    await trackServer(
      ANALYTICS_EVENT.BOOKING_CANCELLED_BY_GUEST,
      workspaceId,
      { bookingUid: event.payload.uid },
    );
  }
  if (event.triggerEvent === "BOOKING_RESCHEDULED") {
    await trackServer(
      ANALYTICS_EVENT.BOOKING_RESCHEDULED_BY_GUEST,
      workspaceId,
      { bookingUid: event.payload.uid },
    );
  }
```

Xoá import `ANALYTICS_EVENT`/`trackServer` khỏi file này nếu không còn chỗ nào khác dùng (kiểm tra bằng cách đọc lại file sau khi xoá).

- [ ] **Bước 4: Thêm 2 lệnh đó vào `upsertCalBookings()` trong `lib/sync-cal-bookings.ts`**

Thêm import đầu file:

```ts
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";
```

Trong khối so sánh `prev`/`row` đã có (đoạn `if (!wasCancelled && nowCancelled) { ... }` và đoạn reschedule ngay sau), thêm lệnh gọi cạnh notification hiện có — ví dụ nhánh cancel:

```ts
    if (!wasCancelled && nowCancelled) {
      const id = await createNotification({ /* ...giữ nguyên... */ });
      if (id) cancelledNotified += 1;
      await trackServer(ANALYTICS_EVENT.BOOKING_CANCELLED_BY_GUEST, workspaceId, {
        bookingUid: row.cal_booking_uid,
      });
      continue;
    }
```

và nhánh reschedule ngay sau đó, cùng kiểu:

```ts
    if (
      !nowCancelled &&
      prev.start_time &&
      row.start_time &&
      prev.start_time !== row.start_time
    ) {
      const id = await createNotification({ /* ...giữ nguyên... */ });
      if (id) rescheduledNotified += 1;
      await trackServer(ANALYTICS_EVENT.BOOKING_RESCHEDULED_BY_GUEST, workspaceId, {
        bookingUid: row.cal_booking_uid,
      });
    }
```

Vì cả hai nhánh chỉ chạy khi trạng thái DB thực sự đổi (so `prev` đọc tươi từ DB), lần webhook gửi lại thứ 2 sẽ thấy `prev` đã phản ánh trạng thái mới → nhánh không chạy lại → không bắn `trackServer` lần 2. Đây là toàn bộ cơ chế idempotency, không thêm bảng nào.

- [ ] **Bước 5: Chạy lại test**

```bash
npm run test -- app/api/cal/webhook/route.test.ts
```

Kỳ vọng: PASS.

- [ ] **Bước 6: Chạy toàn bộ suite**

```bash
npm run test
npm run typecheck
```

Kỳ vọng: exit 0 cả hai.

- [ ] **Bước 7: `graphify update .` + commit**

```bash
graphify update .
git add app/api/cal/webhook lib/sync-cal-bookings.ts graphify-out
git commit -m "fix(calcom): dedupe webhook analytics by moving trackServer next to the state-comparison it depends on"
```

---

### Task 6: `webhook-secret-card.tsx` — trạng thái thay vì hướng dẫn tự dán

**Files:**
- Modify: `app/_components/webhook-secret-card.tsx`
- Modify: `app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `workspaces.cal_webhook_synced_at` (Task 1), đã select được qua query workspace hiện có trong `settings/page.tsx`.
- Produces: prop mới `webhookSyncedAt: string | null` trên `WebhookSecretCard`.

- [ ] **Bước 1: Đọc lại đoạn query workspace trong `settings/page.tsx`**

```bash
grep -n "cal_api_key_encrypted\|\.select(" app/dashboard/settings/page.tsx
```

Ghi lại chính xác câu `.select(...)` đang dùng để thêm `cal_webhook_synced_at` vào danh sách cột mà không xoá cột nào khác.

- [ ] **Bước 2: Thêm cột vào query + truyền prop**

Thêm `cal_webhook_synced_at` vào danh sách cột trong `.select(...)` tìm được ở Bước 1.

Sửa lời gọi `<WebhookSecretCard ... />` (dòng ~250):

```tsx
                  <WebhookSecretCard
                    workspaceId={dashboard.workspaceId}
                    webhookUrl={`${origin}/api/cal/webhook?workspace_id=${dashboard.workspaceId}`}
                    webhookSyncedAt={workspace.cal_webhook_synced_at ?? null}
```

(giữ nguyên các prop khác đã có, ví dụ `hasOwnSecret` — chỉ thêm dòng mới). Tên biến `workspace` phải khớp biến thực tế đang giữ kết quả query trong file — xác nhận lại tên đúng khi sửa, không đoán.

- [ ] **Bước 3: Sửa `WebhookSecretCard` — thêm prop, đổi copy chính từ hướng dẫn thành trạng thái**

```tsx
type Props = {
  workspaceId: string;
  webhookUrl: string;
  hasOwnSecret: boolean;
  webhookSyncedAt: string | null;
};

export function WebhookSecretCard({
  workspaceId,
  webhookUrl,
  hasOwnSecret,
  webhookSyncedAt,
}: Props) {
```

Thay đoạn mô tả đầu card (dòng ~57-63):

```tsx
          <div className="min-w-0">
            <p className="font-medium text-foreground">Cal.com webhook</p>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {webhookSyncedAt
                ? "Registered automatically — bookings changed on Cal.com sync here in real time."
                : "Registering automatically. This can take a moment after you connect Cal.com."}
            </p>
          </div>
```

Giữ nguyên phần URL/secret bên dưới (copy button, `<details>` v.v.) nguyên vẹn — đây là công cụ debug/nâng cao cho ai cần, không còn là bước bắt buộc đầu tiên người dùng thấy.

- [ ] **Bước 4: `npm run doctor` (react-doctor, scope changed)**

```bash
npm run doctor
```

Sửa mọi lỗi/cảnh báo react-doctor báo trước khi coi bước này xong.

- [ ] **Bước 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Bước 6: Kiểm chứng thủ công**

```bash
npm run dev
```

Mở `/dashboard/settings`, cuộn tới card Cal.com webhook. Với workspace demo (`cal_webhook_synced_at` null) → thấy copy "Registering automatically…". Không có cách tự động test UI này trong vitest (không render component) — bước này thay cho test tự động, ghi lại kết quả quan sát được (đúng như mô tả hay không) trước khi commit.

- [ ] **Bước 7: Commit**

```bash
git add app/_components/webhook-secret-card.tsx app/dashboard/settings/page.tsx
git commit -m "feat(settings): show Cal.com webhook as an automatic status, not a manual paste instruction"
```

---

### Task 7: Xác minh thật với tài khoản Cal.com — đóng rủi ro scope OAuth

**Files:** không sửa code trừ khi Bước 3 phát hiện cần sửa `WEBHOOKS_API_VERSION` (Task 2) hoặc thêm scope (ngoài phạm vi plan này — xem Bước 4).

Đây là bước **bắt buộc thủ công** — không có tài khoản Cal.com thật trong CI/test, và đây chính là rủi ro đã nêu ở mục 5 của spec.

- [ ] **Bước 1: Kết nối 1 workspace test qua API key**

Trên 1 workspace sandbox (không phải Pilot, không phải production thật), dán API key thật (`cal_live_...` hoặc `cal_test_...`) qua Setup wizard. Xác nhận trong log server thấy `ensureCalWebhookForWorkspace` chạy, và `GET https://app.cal.com/settings/developer/webhooks` (giao diện Cal.com) hiện webhook mới với `subscriberUrl` đúng.

- [ ] **Bước 2: Kết nối 1 workspace test khác qua OAuth**

Bấm "Connect Cal.com" (OAuth), hoàn tất consent. Kiểm tra log:
- Nếu thấy webhook được tạo thành công → scope hiện tại (`CAL_OAUTH_SCOPES`) đủ, đóng rủi ro mục 5 của spec, không cần làm gì thêm.
- Nếu thấy lỗi 401/403 trong `ensureCalWebhookForWorkspace` → xác nhận đúng scope thiếu, ghi lại thông điệp lỗi thật từ Cal.com.

- [ ] **Bước 3: Nếu Bước 1 hoặc 2 báo lỗi khác 401/403 (vd. 400 sai `cal-api-version` hoặc sai field payload)**

Đọc thông điệp lỗi thật từ Cal.com (không phải đoán), sửa `WEBHOOKS_API_VERSION` hoặc field trong `createWebhook()`/`listWebhooks()` (Task 2, `lib/calcom.ts`) cho khớp, chạy lại test Task 2/3, commit riêng:

```bash
git add lib/calcom.ts
git commit -m "fix(calcom): correct webhook API version/payload against live Cal.com response"
```

- [ ] **Bước 4: Nếu Bước 2 xác nhận thiếu scope OAuth thật sự**

Đây là việc **ngoài phạm vi plan này** (đổi `CAL_OAUTH_SCOPES` kéo theo Cal.com duyệt lại OAuth client + mọi workspace OAuth phải Connect lại — xem amendment trong `docs/superpowers/specs/2026-07-29-cal-oauth-client-design.md`). Báo lại cho chủ dự án kết quả xác nhận được, không tự ý mở rộng scope trong plan này.

Tuỳ chọn nhỏ có thể làm ngay nếu muốn (không bắt buộc): thêm `createNotification({ type: "ai_config", ... })` trong nhánh `catch` của `ensureCalWebhookForWorkspace` khi lỗi là 401/403 — báo chủ tiệm biết "đồng bộ Cal.com hai chiều chưa hoạt động" thay vì im lặng. Nếu làm, viết test riêng (mock `createNotification`, assert được gọi đúng 1 lần khi lỗi 401/403, không gọi khi lỗi khác) trước khi code, cùng nhịp TDD như các task trên.

- [ ] **Bước 5: Dọn workspace test**

Disconnect / xoá webhook test tạo ra trên Cal.com, tránh để lại rác trong tài khoản Cal.com dùng để test.

---

## Self-review trước khi đóng plan

- [ ] Mọi hàm mới (`listWebhooks`, `createWebhook`, `ensureCalWebhookForWorkspace`) đều có nơi gọi thật trong plan (không có hàm mồ côi).
- [ ] `ensureCalWebhookForWorkspace` không throw ra ngoài ở bất kỳ nhánh nào — xác nhận lại try/catch bao trọn Bước 3 của Task 3.
- [ ] Tên field response Cal.com (`subscriberUrl`, `active`, `triggers`, `id`) dùng nhất quán giữa Task 2 và Task 3 — không lệch tên.
- [ ] `CAL_WEBHOOK_TRIGGER_EVENTS` chỉ định nghĩa 1 nơi (`lib/calcom.ts`), route webhook và `ensureCalWebhookForWorkspace` đều import, không định nghĩa lại.
- [ ] Task 5 không làm hỏng test hiện có nào khác gọi `upsertCalBookings`/webhook route — Bước 6 chạy toàn bộ suite để bắt việc này.
- [ ] Không task nào đụng `lib/workspace.ts` hoặc `lib/cal-oauth.ts` (Global Constraints).
- [ ] Rủi ro scope OAuth (mục 5 của spec) có bước xác minh thật (Task 7), không bị bỏ ngỏ.
