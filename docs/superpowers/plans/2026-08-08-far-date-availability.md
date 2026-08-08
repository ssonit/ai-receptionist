# Far-Date Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eve trả lời đúng và trung thực khi khách hỏi lịch trống cho một ngày xa, thay vì hiện nhầm slot hôm nay hoặc bịa "hết chỗ".

**Architecture:** Đọc cửa sổ đặt lịch thật (`bookingWindow`) từ Cal.com thay vì tự chế trần 60 ngày. `check_availability` lọc lại kết quả Cal về đúng `[start, end]` để chặn [cal.com#25405](https://github.com/calcom/cal.com/issues/25405), trả thêm `daysWithSlots` (trả lời "ngày nào" bằng chữ) và `outOfWindow` (báo lịch chưa mở + ngày sẽ mở). Instructions dạy agent hỏi hẹp đúng ngày khách nói.

**Tech Stack:** TypeScript, Next.js, Supabase (Postgres + RLS), Cal.com API v2, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-08-far-date-availability-design.md](../specs/2026-08-08-far-date-availability-design.md)

## Global Constraints

- Agent tool contract: luôn trả `{ ok: true, ... } | { ok: false, error }`, không bao giờ throw qua biên tool. Gọi `logAgentToolEvent` trên cả hai nhánh, kèm `workspaceId`. (`.claude/rules/agent-tools.md`)
- Không dùng `CALCOM_API_KEY` env cho tenant thật — chỉ Eve Pilot. Key tenant qua `getCalApiKeyForWorkspace` + `withCalApiKey`. (`AGENTS.md`)
- Không thêm setting giới hạn đặt lịch trong app. Cal.com là nguồn sự thật duy nhất về cửa sổ đặt lịch.
- Constants: `as const` object + `type X = (typeof X)[keyof typeof X]`. Ưu tiên `type` hơn `interface`. Không dùng `enum`. (`.claude/rules/typescript-conventions.md`)
- Không hardcode tiếng Việt trong `agent/instructions.ts` — instructions viết bằng tiếng Anh, agent tự nói theo locale của khách. **Task này không thêm key i18n nào** (câu trả lời `outOfWindow` do LLM sinh, không phải chrome UI).
- Không lộ chuỗi lỗi thô của Cal ra khách. (`.claude/rules/errors.md`)
- Không đổi `AVAILABILITY_SLOT_UI.MAX_DAYS` (= 1) hay `MAX_SLOTS_PER_DAY` (= 12). Đã chốt.
- Không bỏ cap 40 slot trong `formattedSlots`.
- Sau khi sửa code: chạy `graphify update .` (`AGENTS.md` mục 10).

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `lib/booking-window.ts` (mới) | Logic thuần về cửa sổ đặt lịch: `bookableUntil`, `opensOn`. Không DB, không network. | 1 |
| `lib/booking-window.test.ts` (mới) | Unit test cho trên. | 1 |
| `lib/calcom.ts` | Thêm `CalBookingWindow`, `parseBookingWindow`, gắn vào `CalEventType`. | 2 |
| `lib/calcom.test.ts` | Test `parseBookingWindow`. | 2 |
| `supabase/migrations/20260808000001_workspace_event_types_booking_window.sql` (mới) | Cột `booking_window jsonb`. | 3 |
| `app/dashboard/(main)/meeting-types/actions.ts` | `mirrorRow` ghi `booking_window`. | 3 |
| `app/dashboard/setup/actions.ts` | Sync ghi `booking_window`. | 3 |
| `lib/workspace-cal.ts` | `AiBookingEventType.bookingWindow`; đọc cột + fallback `raw`. | 3 |
| `tests/lib/workspace-cal-booking-window.test.ts` (mới) | Test đọc cột + fallback. | 3 |
| `agent/tools/check_availability.ts` | Lọc phòng thủ, clamp theo cửa sổ, `outOfWindow`, `daysWithSlots`. | 4, 5 |
| `tests/agent-tools/check_availability.test.ts` | Test cả hai. | 4, 5 |
| `agent/instructions.ts` | Dạy agent query hẹp + xử lý `outOfWindow` / `truncated` / `daysWithSlots`. | 6 |

**Lưu ý layering:** `lib/booking-window.ts` import từ `@/agent/date-context`. Ngược chiều thông thường, nhưng đây là tiền lệ sẵn có — `app/dashboard/(main)/bookings/actions.ts:4` đã import module này, và `vitest.config.mts:72` xếp `agent/date-context.ts` chung coverage tier với `lib/**`. **Không** refactor nó trong plan này.

---

### Task 1: `lib/booking-window.ts` — logic cửa sổ đặt lịch

**Files:**
- Create: `lib/booking-window.ts`
- Test: `lib/booking-window.test.ts`

**Interfaces:**
- Consumes: `addDaysYmd(ymd, days, timeZone)`, `compareYmd(a, b)` từ `@/agent/date-context`.
- Produces:
  - `type CalBookingWindow` — union 3 nhánh (Task 2 import lại từ `@/lib/calcom`; ở task này định nghĩa tại `lib/booking-window.ts` và Task 2 re-export).
  - `DEFAULT_MAX_ADVANCE_DAYS: 60`
  - `bookableUntil(window: CalBookingWindow | null, today: string, timeZone: string): string`
  - `opensOn(window: CalBookingWindow | null, target: string, timeZone: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `lib/booking-window.test.ts`:

```ts
/**
 * Pure booking-window math. No DB, no network.
 * Reference: 2026-08-08 is a Saturday; 2026-08-10 is a Monday.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_ADVANCE_DAYS,
  bookableUntil,
  opensOn,
} from "./booking-window";

const TZ = "Asia/Ho_Chi_Minh";

describe("bookableUntil", () => {
  it("adds calendar days straight through weekends", () => {
    expect(
      bookableUntil({ type: "calendarDays", value: 60, rolling: true }, "2026-08-08", TZ),
    ).toBe("2026-10-07");
  });

  it("skips weekends for business days", () => {
    // 10 business days from Mon 2026-08-10 lands on Mon 2026-08-24.
    expect(
      bookableUntil({ type: "businessDays", value: 10, rolling: true }, "2026-08-10", TZ),
    ).toBe("2026-08-24");
  });

  it("returns endDate for a fixed range", () => {
    expect(
      bookableUntil(
        { type: "range", startDate: "2026-09-01", endDate: "2026-09-30" },
        "2026-08-08",
        TZ,
      ),
    ).toBe("2026-09-30");
  });

  it("falls back to the Eve-side cap when the window is unlimited", () => {
    expect(bookableUntil(null, "2026-08-08", TZ)).toBe("2026-10-07");
    expect(DEFAULT_MAX_ADVANCE_DAYS).toBe(60);
  });
});

describe("opensOn", () => {
  it("returns the day a calendar-day window first reaches the target", () => {
    // 2026-10-10 + 60 calendar days = 2026-12-09.
    expect(
      opensOn({ type: "calendarDays", value: 60, rolling: true }, "2026-12-09", TZ),
    ).toBe("2026-10-10");
  });

  it("round-trips with bookableUntil for business days", () => {
    const window = { type: "businessDays", value: 20, rolling: true } as const;
    const open = opensOn(window, "2026-12-09", TZ)!;
    expect(compare(bookableUntil(window, open, TZ), "2026-12-09")).toBeGreaterThanOrEqual(0);
    // One day earlier must NOT reach the target — proves it is the earliest.
    const dayBefore = shiftYmd(open, -1);
    expect(compare(bookableUntil(window, dayBefore, TZ), "2026-12-09")).toBeLessThan(0);
  });

  it("returns null for a fixed range (nothing rolls open)", () => {
    expect(
      opensOn(
        { type: "range", startDate: "2026-09-01", endDate: "2026-09-30" },
        "2026-12-09",
        TZ,
      ),
    ).toBeNull();
  });

  it("returns null when the window is unlimited", () => {
    expect(opensOn(null, "2026-12-09", TZ)).toBeNull();
  });
});

function compare(a: string, b: string): number {
  return a.localeCompare(b);
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/booking-window.test.ts
```

Expected: FAIL — `Failed to resolve import "./booking-window"`.

- [ ] **Step 3: Write the implementation**

Create `lib/booking-window.ts`:

```ts
/**
 * Cửa sổ đặt lịch của Cal.com ("Limit future bookings").
 * Pure math — không DB, không network, để test rẻ.
 *
 * @see https://cal.com/help/event-types/limit-future-bookings
 */
import { addDaysYmd, compareYmd } from "@/agent/date-context";

/**
 * Shape của field `bookingWindow` trong Cal.com API v2 event type.
 * `rolling` phân biệt ROLLING_WINDOW ("always N days available") với ROLLING.
 * Mình coi cả hai như nhau — ROLLING_WINDOW thực tế có thể vươn xa hơn N ngày,
 * nên cách hiểu này chỉ khiến `bookableUntil` **sớm hơn** thực tế (bảo thủ, không hứa quá).
 */
export type CalBookingWindow =
  | { type: "businessDays"; value: number; rolling: boolean }
  | { type: "calendarDays"; value: number; rolling: boolean }
  | { type: "range"; startDate: string; endDate: string };

/** Trần tự đặt của Eve khi Cal không giới hạn (UNLIMITED). */
export const DEFAULT_MAX_ADVANCE_DAYS = 60;

/** Chỉ bỏ T7/CN. Cal.com có thể tính ngày lễ khác — sai lệch nghiêng về phía bảo thủ. */
function isWeekend(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function shiftBusinessDays(
  ymd: string,
  days: number,
  timeZone: string,
  direction: 1 | -1,
): string {
  let cursor = ymd;
  let remaining = days;
  while (remaining > 0) {
    cursor = addDaysYmd(cursor, direction, timeZone);
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return cursor;
}

/** Ngày xa nhất khách có thể đặt, tính từ `today` (YYYY-MM-DD, giờ business). */
export function bookableUntil(
  window: CalBookingWindow | null,
  today: string,
  timeZone: string,
): string {
  if (!window) return addDaysYmd(today, DEFAULT_MAX_ADVANCE_DAYS, timeZone);
  if (window.type === "range") return window.endDate;
  if (window.type === "calendarDays") {
    return addDaysYmd(today, window.value, timeZone);
  }
  return shiftBusinessDays(today, window.value, timeZone, 1);
}

/**
 * Ngày sớm nhất mà cửa sổ vươn tới `target` — tức ngày khách quay lại đặt được.
 * `null` khi cửa sổ không lăn (range) hoặc không giới hạn.
 */
export function opensOn(
  window: CalBookingWindow | null,
  target: string,
  timeZone: string,
): string | null {
  if (!window || window.type === "range") return null;

  let candidate =
    window.type === "calendarDays"
      ? addDaysYmd(target, -window.value, timeZone)
      : shiftBusinessDays(target, window.value, timeZone, -1);

  // `bookableUntil` không giảm khi `today` tăng, nên chỉnh hai chiều là tìm được
  // đúng ngày sớm nhất. Giới hạn vòng lặp phòng dữ liệu Cal dị thường.
  const MAX_ADJUST = 14;
  for (let i = 0; i < MAX_ADJUST; i++) {
    if (compareYmd(bookableUntil(window, candidate, timeZone), target) >= 0) break;
    candidate = addDaysYmd(candidate, 1, timeZone);
  }
  for (let i = 0; i < MAX_ADJUST; i++) {
    const earlier = addDaysYmd(candidate, -1, timeZone);
    if (compareYmd(bookableUntil(window, earlier, timeZone), target) < 0) break;
    candidate = earlier;
  }
  return candidate;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/booking-window.test.ts
```

Expected: PASS (9 tests).

Nếu ca `businessDays` fail, in ra giá trị thật rồi đối chiếu bằng lịch — **đừng** sửa test cho khớp code mà chưa xác nhận ngày nào đúng.

- [ ] **Step 5: Commit**

```bash
git add lib/booking-window.ts lib/booking-window.test.ts
git commit -m "feat(booking): add booking-window math for Cal.com future-booking limits"
```

---

### Task 2: `parseBookingWindow` trong `lib/calcom.ts`

**Files:**
- Modify: `lib/calcom.ts` (type `CalEventType` ~L71-79, `parseCalEventType` ~L493-515)
- Test: `lib/calcom.test.ts` (thêm describe block)

**Interfaces:**
- Consumes: `CalBookingWindow` từ `@/lib/booking-window` (Task 1).
- Produces:
  - `export function parseBookingWindow(input: unknown): CalBookingWindow | undefined`
  - `CalEventType.bookingWindow?: CalBookingWindow`
  - Re-export `export type { CalBookingWindow }` để consumer chỉ cần import từ `@/lib/calcom`.

- [ ] **Step 1: Write the failing test**

Thêm vào `lib/calcom.test.ts`, bên trong `describe("calcom", ...)`:

```ts
  describe("parseBookingWindow", () => {
    it("parses a calendarDays window from the API array", async () => {
      const { parseBookingWindow } = await import("./calcom");
      expect(
        parseBookingWindow([{ type: "calendarDays", value: 60, rolling: true }]),
      ).toEqual({ type: "calendarDays", value: 60, rolling: true });
    });

    it("parses a businessDays window", async () => {
      const { parseBookingWindow } = await import("./calcom");
      expect(
        parseBookingWindow([{ type: "businessDays", value: 30, rolling: false }]),
      ).toEqual({ type: "businessDays", value: 30, rolling: false });
    });

    it("parses a range window", async () => {
      const { parseBookingWindow } = await import("./calcom");
      expect(
        parseBookingWindow([
          { type: "range", startDate: "2026-09-01", endDate: "2026-09-30" },
        ]),
      ).toEqual({ type: "range", startDate: "2026-09-01", endDate: "2026-09-30" });
    });

    it("accepts a bare object, not just an array", async () => {
      const { parseBookingWindow } = await import("./calcom");
      expect(
        parseBookingWindow({ type: "calendarDays", value: 15, rolling: true }),
      ).toEqual({ type: "calendarDays", value: 15, rolling: true });
    });

    it("returns undefined for unlimited / empty / malformed input", async () => {
      const { parseBookingWindow } = await import("./calcom");
      expect(parseBookingWindow(undefined)).toBeUndefined();
      expect(parseBookingWindow(null)).toBeUndefined();
      expect(parseBookingWindow([])).toBeUndefined();
      expect(parseBookingWindow([{ type: "nonsense", value: 5 }])).toBeUndefined();
      expect(parseBookingWindow([{ type: "calendarDays", value: 0 }])).toBeUndefined();
      expect(parseBookingWindow([{ type: "range", startDate: "2026-09-01" }])).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/calcom.test.ts -t parseBookingWindow
```

Expected: FAIL — `parseBookingWindow is not a function`.

- [ ] **Step 3: Write the implementation**

Trong `lib/calcom.ts`, thêm import ở đầu file (cạnh các import sẵn có):

```ts
import type { CalBookingWindow } from "@/lib/booking-window";
```

Thêm re-export ngay dưới các type export:

```ts
export type { CalBookingWindow };
```

Thêm `bookingWindow` vào `CalEventType`:

```ts
export type CalEventType = {
  id: number;
  slug: string;
  title: string;
  lengthInMinutes: number;
  minimumBookingNotice?: number;
  description?: string;
  /** Cal.com "Limit future bookings". `undefined` = UNLIMITED. */
  bookingWindow?: CalBookingWindow;
  raw: unknown;
};
```

Thêm hàm parse ngay trên `parseCalEventType`:

```ts
/**
 * API v2 trả `bookingWindow` dạng mảng (oneOf 3 schema). Chấp nhận cả object trần
 * phòng khi shape đổi. Bất kỳ thứ gì không nhận diện được → undefined (UNLIMITED).
 */
export function parseBookingWindow(input: unknown): CalBookingWindow | undefined {
  const candidate = Array.isArray(input) ? input[0] : input;
  if (!candidate || typeof candidate !== "object") return undefined;
  const row = candidate as Record<string, unknown>;

  if (row.type === "range") {
    const startDate = typeof row.startDate === "string" ? row.startDate : "";
    const endDate = typeof row.endDate === "string" ? row.endDate : "";
    if (!startDate || !endDate) return undefined;
    return { type: "range", startDate, endDate };
  }

  if (row.type === "businessDays" || row.type === "calendarDays") {
    const value = Number(row.value);
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return { type: row.type, value, rolling: row.rolling === true };
  }

  return undefined;
}
```

Gắn vào `parseCalEventType` — thêm một dòng vào object trả về:

```ts
  return {
    id,
    slug,
    title,
    lengthInMinutes,
    minimumBookingNotice:
      typeof notice === "number" && Number.isFinite(notice) ? notice : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
    bookingWindow: parseBookingWindow(item.bookingWindow),
    raw: item,
  };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/calcom.test.ts
```

Expected: PASS — 5 test mới, các test cũ vẫn xanh.

- [ ] **Step 5: Commit**

```bash
git add lib/calcom.ts lib/calcom.test.ts
git commit -m "feat(calcom): parse bookingWindow from Cal.com event types"
```

---

### Task 3: Lưu và đọc `bookingWindow`

**Files:**
- Create: `supabase/migrations/20260808000001_workspace_event_types_booking_window.sql`
- Modify: `app/dashboard/(main)/meeting-types/actions.ts` (hàm `mirrorRow`, ~L28-46)
- Modify: `app/dashboard/setup/actions.ts` (~L95-105, object mirror event type)
- Modify: `lib/workspace-cal.ts` (`AiBookingEventType` ~L4-13, `WorkspaceEventTypeRow` ~L44-57, `getAiBookingEventType` ~L67-150)
- Test: `tests/lib/workspace-cal-booking-window.test.ts`

**Interfaces:**
- Consumes: `parseBookingWindow` từ `@/lib/calcom` (Task 2); `CalBookingWindow` từ `@/lib/booking-window` (Task 1).
- Produces: `AiBookingEventType.bookingWindow: CalBookingWindow | null` — Task 5 dùng field này.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/workspace-cal-booking-window.test.ts`:

```ts
/**
 * getAiBookingEventType phải trả bookingWindow từ cột chuyên dụng,
 * và fallback sang `raw` cho tenant chưa re-sync.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../helpers/supabase-mock";

const WS_ID = "11111111-1111-4000-8000-111111111111";

function seedWorkspace() {
  supabaseMock.seed("workspaces", [
    {
      id: WS_ID,
      name: "Salon",
      slug: "salon",
      timezone: "Asia/Ho_Chi_Minh",
      cal_event_type_id: 555,
      cal_event_type_slug: "cut-30",
      cal_username: "salon-cal",
      cal_api_key_encrypted: null,
      service_mode: "onsite",
    },
  ]);
}

function seedEventType(extra: Record<string, unknown>) {
  supabaseMock.seed("workspace_event_types", [
    {
      id: "evt-1",
      workspace_id: WS_ID,
      cal_event_type_id: 555,
      title: "Cut",
      slug: "cut-30",
      length_minutes: 30,
      minimum_notice_minutes: 120,
      is_ai_booking: true,
      booking_window: null,
      raw: null,
      ...extra,
    },
  ]);
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("getAiBookingEventType bookingWindow", () => {
  it("reads the dedicated booking_window column", async () => {
    seedWorkspace();
    seedEventType({
      booking_window: { type: "calendarDays", value: 60, rolling: true },
    });

    const { getAiBookingEventType } = await import("@/lib/workspace-cal");
    const result = await getAiBookingEventType(WS_ID);

    expect(result?.bookingWindow).toEqual({
      type: "calendarDays",
      value: 60,
      rolling: true,
    });
  });

  it("falls back to raw.bookingWindow when the column is null", async () => {
    seedWorkspace();
    seedEventType({
      booking_window: null,
      raw: { bookingWindow: [{ type: "businessDays", value: 30, rolling: false }] },
    });

    const { getAiBookingEventType } = await import("@/lib/workspace-cal");
    const result = await getAiBookingEventType(WS_ID);

    expect(result?.bookingWindow).toEqual({
      type: "businessDays",
      value: 30,
      rolling: false,
    });
  });

  it("returns null bookingWindow when neither source has one", async () => {
    seedWorkspace();
    seedEventType({ booking_window: null, raw: { id: 555 } });

    const { getAiBookingEventType } = await import("@/lib/workspace-cal");
    const result = await getAiBookingEventType(WS_ID);

    expect(result?.bookingWindow).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/workspace-cal-booking-window.test.ts
```

Expected: FAIL — `result.bookingWindow` là `undefined`, không phải object.

- [ ] **Step 3a: Write the migration**

Create `supabase/migrations/20260808000001_workspace_event_types_booking_window.sql`:

```sql
-- Cal.com "Limit future bookings" (bookingWindow) mirrored per meeting type.
-- Shape: {"type":"calendarDays"|"businessDays","value":N,"rolling":bool}
--     or {"type":"range","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}
-- NULL = UNLIMITED (or not synced yet — readers fall back to `raw`).
alter table public.workspace_event_types
  add column if not exists booking_window jsonb;

comment on column public.workspace_event_types.booking_window is
  'Cal.com bookingWindow. NULL means unlimited or not yet synced.';
```

Không đụng RLS — bảng đã có policy scope theo `workspace_id`, thêm cột không cần policy mới.

- [ ] **Step 3b: Ghi cột khi sync (hai chỗ)**

Trong `app/dashboard/(main)/meeting-types/actions.ts`, hàm `mirrorRow` — thêm một dòng:

```ts
function mirrorRow(
  workspaceId: string,
  et: CalEventType,
  extras?: { isAiBooking?: boolean },
) {
  return {
    workspace_id: workspaceId,
    cal_event_type_id: et.id,
    slug: et.slug,
    title: et.title,
    length_minutes: et.lengthInMinutes,
    minimum_notice_minutes: et.minimumBookingNotice ?? null,
    booking_window: et.bookingWindow ?? null,
    raw: et.raw,
    synced_at: new Date().toISOString(),
    ...(extras?.isAiBooking !== undefined
      ? { is_ai_booking: extras.isAiBooking }
      : {}),
  };
}
```

Trong `app/dashboard/setup/actions.ts`, tìm object có `minimum_notice_minutes: et.minimumBookingNotice ?? null` (khoảng L100) và thêm ngay dưới nó:

```ts
      booking_window: et.bookingWindow ?? null,
```

- [ ] **Step 3c: Đọc trong `lib/workspace-cal.ts`**

Thêm import:

```ts
import { parseBookingWindow } from "@/lib/calcom";
import type { CalBookingWindow } from "@/lib/booking-window";
```

Thêm field vào `AiBookingEventType`:

```ts
export type AiBookingEventType = {
  workspaceId: string;
  id: string;
  calEventTypeId: number;
  slug: string;
  title: string;
  lengthMinutes: number;
  minimumNoticeMinutes: number | null;
  /** Cal.com "Limit future bookings". `null` = unlimited / chưa sync. */
  bookingWindow: CalBookingWindow | null;
  username: string;
};
```

Thêm vào `WorkspaceEventTypeRow`:

```ts
  booking_window: unknown | null;
```

Trong `getAiBookingEventType`, sửa chuỗi `.select(...)` của `workspace_event_types` để lấy thêm hai cột (**bắt buộc** — `raw` hiện chưa có trong select này):

```ts
      .select(
        "id, workspace_id, cal_event_type_id, slug, title, length_minutes, minimum_notice_minutes, booking_window, raw, is_ai_booking",
      )
```

Thêm helper ngay trên `getAiBookingEventType`:

```ts
/** Cột chuyên dụng trước; `raw` là fallback cho tenant chưa re-sync sau migration. */
function readBookingWindow(row: {
  booking_window?: unknown;
  raw?: unknown;
}): CalBookingWindow | null {
  const fromColumn = parseBookingWindow(row.booking_window);
  if (fromColumn) return fromColumn;
  const raw = row.raw;
  if (raw && typeof raw === "object") {
    const fromRaw = parseBookingWindow(
      (raw as Record<string, unknown>).bookingWindow,
    );
    if (fromRaw) return fromRaw;
  }
  return null;
}
```

Trong nhánh `if (aiRow)` thêm:

```ts
      bookingWindow: readBookingWindow(aiRow),
```

Trong **cả ba** nhánh fallback còn lại (`workspace?.cal_event_type_id`, và hai nhánh env bootstrap của Eve Pilot) thêm:

```ts
      bookingWindow: null,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/workspace-cal-booking-window.test.ts
npx vitest run
npm run typecheck
```

Expected: test mới PASS; toàn bộ suite PASS (typecheck sẽ bắt nhánh nào thiếu `bookingWindow`).

Áp migration lên local:

```bash
npx supabase db reset
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260808000001_workspace_event_types_booking_window.sql lib/workspace-cal.ts "app/dashboard/(main)/meeting-types/actions.ts" app/dashboard/setup/actions.ts tests/lib/workspace-cal-booking-window.test.ts
git commit -m "feat(booking): mirror Cal.com bookingWindow onto meeting types"
```

---

### Task 4: Lọc phòng thủ slot theo `[start, end]`

Đây là hàng rào cho bug [cal.com#25405](https://github.com/calcom/cal.com/issues/25405). Làm riêng khỏi Task 5 vì nó tự đứng được và tự test được.

**Files:**
- Modify: `agent/tools/check_availability.ts` (~L114-147, L190-195)
- Test: `tests/agent-tools/check_availability.test.ts`

**Interfaces:**
- Consumes: `calendarDayInTimeZone` (đã import ở L8), `compareYmd` (đã import ở L16).
- Produces: `count`, `truncated`, `slots`, `slotsByDay` đều tính từ tập đã lọc.

- [ ] **Step 1: Write the failing test**

Thêm vào `tests/agent-tools/check_availability.test.ts`, trong `describe("check_availability tool", ...)`:

```ts
  it("drops slots outside the requested range (cal.com#25405 rolling-window bug)", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: 123,
        cal_event_type_slug: "consultation-30",
        cal_username: "test-cal-user",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-1",
        workspace_id: PILOT_ID,
        cal_event_type_id: 123,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
        booking_window: null,
        raw: null,
      },
    ]);

    const mod = await import("@/lib/calcom");
    // Cal ignores `start` and replies from "today" — the shape of the real bug.
    vi.mocked(mod.getAvailableSlots).mockResolvedValue([
      { start: "2026-08-08T02:00:00.000Z" },
      { start: "2026-08-09T02:00:00.000Z" },
      { start: "2026-12-09T02:00:00.000Z" },
      { start: "2026-12-10T02:00:00.000Z" },
    ]);

    type CheckResult =
      | {
          ok: true;
          count: number;
          truncated: boolean;
          slots: Array<{ start: string }>;
          slotsByDay: Record<string, unknown>;
        }
      | { ok: false; error: string };

    const tool = (await import("../../agent/tools/check_availability")).default as {
      execute: (
        input: { startDate: string; endDate: string },
        ctx: unknown,
      ) => Promise<CheckResult>;
    };

    const result = await tool.execute(
      { startDate: "2026-12-09", endDate: "2026-12-10" },
      { session: { id: "test-session", auth: { current: null, initiator: null } } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(2);
      expect(Object.keys(result.slotsByDay).toSorted()).toEqual([
        "2026-12-09",
        "2026-12-10",
      ]);
      expect(result.slots.every((s) => s.start.startsWith("2026-12"))).toBe(true);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent-tools/check_availability.test.ts -t "cal.com#25405"
```

Expected: FAIL — `count` là 4, `slotsByDay` chứa cả `2026-08-08`.

- [ ] **Step 3: Write the implementation**

Trong `agent/tools/check_availability.ts`, ngay sau khối `const slots = await withCalApiKey(...)` (kết thúc ~L123), chèn:

```ts
      // Cal.com bỏ qua `start` khi event type bật rolling window
      // (https://github.com/calcom/cal.com/issues/25405), nên không tin kết quả:
      // lọc lại về đúng khoảng đã hỏi. Nếu Cal fix, đoạn này thành no-op.
      const inRange = slots.filter((slot) => {
        const day = calendarDayInTimeZone(slot.start, businessTz);
        return compareYmd(day, start) >= 0 && compareYmd(day, end) <= 0;
      });
      if (inRange.length !== slots.length) {
        notes.push(
          `Filtered ${slots.length - inRange.length} slots outside ${start}..${end} (Cal.com returned days beyond the requested range). Internal note — do not read this to the guest.`,
        );
      }
```

Đổi `slots.slice(0, 40)` thành `inRange.slice(0, 40)`:

```ts
      const formattedSlots: SlotRow[] = inRange.slice(0, 40).map((slot) => {
```

Trong object trả về, đổi hai field sang nguồn đã lọc:

```ts
        count: inRange.length,
        // ...
        earliestStart: inRange[0]?.start,
        slots: formattedSlots,
        truncated: inRange.length > 40,
```

Và `meta` của `logAgentToolEvent` (~L170):

```ts
        meta: { count: inRange.length, start, end, guestTz },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/agent-tools/check_availability.test.ts
```

Expected: PASS — test mới xanh, test "returns slots grouped by day on happy path" vẫn `count === 3` (cả 3 slot đều trong `2026-08-05..2026-08-10`).

- [ ] **Step 5: Commit**

```bash
git add agent/tools/check_availability.ts tests/agent-tools/check_availability.test.ts
git commit -m "fix(agent): filter Cal.com slots to the requested range"
```

---

### Task 5: `outOfWindow` + `daysWithSlots`

**Files:**
- Modify: `agent/tools/check_availability.ts` (~L67-91 khối clamp, và object trả về)
- Test: `tests/agent-tools/check_availability.test.ts`

**Interfaces:**
- Consumes: `bookableUntil`, `opensOn` từ `@/lib/booking-window` (Task 1); `aiEvent.bookingWindow` (Task 3); `inRange` (Task 4).
- Produces: field mới trong output tool — `outOfWindow`, `bookableUntil`, `opensOn`, `requestedDate`, `daysWithSlots`. Task 6 dạy agent dùng chúng.

- [ ] **Step 1: Write the failing tests**

Thêm hai test vào `tests/agent-tools/check_availability.test.ts`. Dùng lại hai helper seed — nếu file chưa có, trích ra hàm dùng chung trước:

```ts
  it("returns outOfWindow without calling Cal when the date is past the booking window", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: 123,
        cal_event_type_slug: "consultation-30",
        cal_username: "test-cal-user",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-1",
        workspace_id: PILOT_ID,
        cal_event_type_id: 123,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
        booking_window: { type: "calendarDays", value: 60, rolling: true },
        raw: null,
      },
    ]);

    vi.setSystemTime(new Date("2026-08-08T03:00:00.000Z"));

    const mod = await import("@/lib/calcom");
    const mockGetSlots = vi.mocked(mod.getAvailableSlots);
    mockGetSlots.mockResolvedValue([]);

    type CheckResult =
      | {
          ok: true;
          outOfWindow?: boolean;
          bookableUntil?: string;
          opensOn?: string | null;
          requestedDate?: string;
          slots: unknown[];
        }
      | { ok: false; error: string };

    const tool = (await import("../../agent/tools/check_availability")).default as {
      execute: (
        input: { startDate: string; endDate: string },
        ctx: unknown,
      ) => Promise<CheckResult>;
    };

    const result = await tool.execute(
      { startDate: "2026-12-09", endDate: "2026-12-09" },
      { session: { id: "test-session", auth: { current: null, initiator: null } } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outOfWindow).toBe(true);
      expect(result.bookableUntil).toBe("2026-10-07");
      expect(result.opensOn).toBe("2026-10-10");
      expect(result.requestedDate).toBe("2026-12-09");
      expect(result.slots).toEqual([]);
    }
    // Không tốn round-trip tới Cal.
    expect(mockGetSlots).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("reports every day with openings even when slots are truncated at 40", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: 123,
        cal_event_type_slug: "consultation-30",
        cal_username: "test-cal-user",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-1",
        workspace_id: PILOT_ID,
        cal_event_type_id: 123,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
        booking_window: null,
        raw: null,
      },
    ]);

    // 3 ngày × 30 slot = 90; cap 40 sẽ cắt mất ngày thứ 3 khỏi `slots`.
    const days = ["2026-08-10", "2026-08-11", "2026-08-12"];
    const many = days.flatMap((day) =>
      Array.from({ length: 30 }, (_, i) => ({
        start: `${day}T${String(i).padStart(2, "0")}:00:00.000Z`,
      })),
    );

    const mod = await import("@/lib/calcom");
    vi.mocked(mod.getAvailableSlots).mockResolvedValue(many);

    type CheckResult =
      | { ok: true; daysWithSlots?: string[]; truncated: boolean; count: number }
      | { ok: false; error: string };

    const tool = (await import("../../agent/tools/check_availability")).default as {
      execute: (
        input: { startDate: string; endDate: string },
        ctx: unknown,
      ) => Promise<CheckResult>;
    };

    const result = await tool.execute(
      { startDate: "2026-08-10", endDate: "2026-08-12" },
      { session: { id: "test-session", auth: { current: null, initiator: null } } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.truncated).toBe(true);
      expect(result.count).toBe(90);
      expect(result.daysWithSlots).toEqual(days);
    }
  });
```

Ở đầu file, đảm bảo có `vi.useFakeTimers()` khả dụng — thêm vào `beforeEach` hiện có:

```ts
beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/agent-tools/check_availability.test.ts -t outOfWindow
npx vitest run tests/agent-tools/check_availability.test.ts -t "every day with openings"
```

Expected: FAIL — `outOfWindow` undefined; `daysWithSlots` undefined.

- [ ] **Step 3: Write the implementation**

Trong `agent/tools/check_availability.ts` thêm import:

```ts
import { bookableUntil, opensOn } from "@/lib/booking-window";
```

Thay khối clamp trần 60 ngày (hiện là `const maxEnd = addDaysYmd(start, 60, businessTz);` cùng `if`/`notes.push` của nó) bằng:

```ts
      const maxEnd = bookableUntil(aiEvent.bookingWindow, today, businessTz);

      // Khách hỏi hẳn ra ngoài cửa sổ: trả lời tất định, không tốn round-trip tới Cal.
      if (compareYmd(start, maxEnd) > 0) {
        await logAgentToolEvent({
          toolName: "check_availability",
          ok: true,
          sessionId,
          chatSessionId,
          workspaceId,
          meta: { outOfWindow: true, start, bookableUntil: maxEnd },
        });
        return {
          ok: true as const,
          outOfWindow: true as const,
          requestedDate: start,
          bookableUntil: maxEnd,
          opensOn: opensOn(aiEvent.bookingWindow, start, businessTz),
          timezone: businessTz,
          businessTimeZone: businessTz,
          guestTimeZone: guestTz,
          serviceMode,
          today,
          eventType: {
            id: aiEvent.calEventTypeId || null,
            slug: aiEvent.slug,
            title: aiEvent.title,
            lengthMinutes: aiEvent.lengthMinutes,
          },
          startDate: start,
          endDate: end,
          count: 0,
          daysWithSlots: [] as string[],
          slotsByDay: {} as Record<string, never>,
          slots: [] as never[],
          truncated: false,
        };
      }

      if (compareYmd(end, maxEnd) > 0) {
        notes.push(
          `Clamped endDate from ${end} to ${maxEnd} (furthest date this calendar accepts).`,
        );
        end = maxEnd;
      }
```

Trong object trả về của nhánh thường, thêm hai field:

```ts
        outOfWindow: false as const,
        bookableUntil: maxEnd,
        daysWithSlots: Object.keys(byDayAll).toSorted(),
```

`byDayAll` là map ngày tính trên **toàn bộ** `inRange`, không phải 40 slot đầu. Thêm ngay sau khối `formattedSlots`:

```ts
      // Toàn bộ ngày có slot trong khoảng — không bị cap 40 làm mất.
      // Đây là thứ trả lời câu "còn trống ngày nào" bằng chữ, không đẻ thêm nút trên UI.
      const byDayAll: Record<string, true> = {};
      for (const slot of inRange) {
        byDayAll[calendarDayInTimeZone(slot.start, businessTz)] = true;
      }
```

**Không** đổi `slotsByDay` — nó vẫn build từ 40 slot đã format, vì picker chỉ cần giờ của một ngày.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/agent-tools/check_availability.test.ts
npm run typecheck
```

Expected: PASS toàn bộ file; typecheck sạch.

- [ ] **Step 5: Commit**

```bash
git add agent/tools/check_availability.ts tests/agent-tools/check_availability.test.ts
git commit -m "feat(agent): add outOfWindow and daysWithSlots to check_availability"
```

---

### Task 6: Instructions

**Files:**
- Modify: `agent/instructions.ts` (khối "Current time (required)" ~L211-218; thêm khối mới sau nó)

**Interfaces:**
- Consumes: field `outOfWindow`, `bookableUntil`, `opensOn`, `daysWithSlots`, `truncated` từ Task 5.
- Produces: không có API mới.

- [ ] **Step 1: Sửa quy tắc chọn khoảng ngày**

Trong `agent/instructions.ts`, thay dòng:

```ts
- If the guest does not specify a date: default to checking from today through the next 7 days.
```

bằng ba dòng:

```ts
- If the guest names a **specific date**, call \`check_availability\` for **that date** (at most ±1 day around it). Do **not** sweep 7 days — the web picker shows one day, and a wide sweep makes it show the wrong one.
- If the guest does **not** specify a date: default to checking from today through the next 7 days.
- If the guest asks about a **long span** ("this week", "next month"), use \`daysWithSlots\` to name the open days **in text**, ask which day they want, then call \`check_availability\` again for that single day.
```

Ngay dưới đó, thêm:

```ts
- If \`truncated\` is true, there are more times than the tool returned — say so. Never present the listed slots as the complete set.
```

- [ ] **Step 2: Thêm khối `outOfWindow`**

Chèn sau khối "Same-day / \"this afternoon\" near the notice window" (kết thúc ~L227):

```ts
# Dates beyond the booking window

- \`check_availability\` may return \`outOfWindow: true\`. That means the calendar is **not open that far ahead** — it does **not** mean the day is fully booked. Never say "fully booked" or invent another reason.
- Tell the guest the furthest date they can book right now: \`bookableUntil\`.
- If \`opensOn\` is set, add that they can book their requested date from that day onward, and call \`log_lead\` so staff can follow up.
- If \`opensOn\` is null (fixed date range), only state \`bookableUntil\`.
- Do **not** offer nearby slots unprompted — someone asking about a date months away is not looking for tomorrow. Ask whether they want something sooner instead.
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. (Chuỗi trong template literal — chú ý escape backtick đúng như các khối sẵn có trong file.)

- [ ] **Step 4: Chạy lại toàn bộ test**

```bash
npx vitest run
```

Expected: PASS. Có test snapshot instructions thì cập nhật cho khớp và đọc lại diff trước khi chấp nhận.

- [ ] **Step 5: Commit**

```bash
git add agent/instructions.ts
git commit -m "feat(agent): teach Eve to handle dates beyond the booking window"
```

---

### Task 7: Xác minh cuối

**Files:** không sửa file nào (trừ khi bước nào fail).

- [ ] **Step 1: Full suite + typecheck**

```bash
npx vitest run
```

```bash
npm run typecheck
```

Expected: cả hai xanh. Baseline trước khi bắt đầu plan này: **543 test / 61 file**. Sau plan: nhiều hơn (9 + 5 + 3 + 1 + 2 = 20 test mới).

- [ ] **Step 2: Cập nhật knowledge graph**

```bash
graphify update .
```

- [ ] **Step 3: Kiểm tra không lọt UI regression**

Task này không sửa file `.tsx` nào, nên `npm run doctor` không bắt buộc. Nếu có đụng component, chạy:

```bash
npm run doctor
```

- [ ] **Step 4: Kiểm tra thủ công (`.claude/skills/test-feature`)**

Với workspace có Cal.com event type đã bật "Limit future bookings" 60 ngày:

1. Hỏi trong chat: "ngày 9/12/2026 còn trống không?" → phải trả lời lịch chưa mở tới đó, nêu ngày xa nhất đặt được và ngày sẽ mở. **Không** hiện grid slot hôm nay.
2. Hỏi "thứ 5 tuần sau có giờ nào?" → grid phải hiện đúng thứ 5 đó, không phải hôm nay.
3. Hỏi "tuần sau còn ngày nào trống?" → trả lời bằng chữ, liệt kê ngày; chọn một ngày thì mới hiện grid.
4. Với event type **không** bật giới hạn: hỏi ngày cách 90 ngày → clamp về 60 ngày, giải thích rõ.

- [ ] **Step 5: Commit dọn dẹp (nếu có)**

```bash
git add -A
git commit -m "chore: refresh graphify output after far-date availability work"
```

---

## Self-Review

**Spec coverage:**

| Yêu cầu spec | Task |
|---|---|
| P1 — lọc slot theo range | 4 |
| P2 — đọc `bookingWindow` | 1, 2, 3 |
| P3 — `daysWithSlots` ngoài cap 40 | 5 |
| P4 — instructions query hẹp | 6 |
| §3.1 parse `bookingWindow` | 2 |
| §3.2 cột + fallback `raw` | 3 |
| §3.3 `lib/booking-window.ts` | 1 |
| §3.4(a) clamp theo cửa sổ | 5 |
| §3.4(b) `outOfWindow` | 5 |
| §3.4(c) lọc phòng thủ | 4 |
| §3.4(d) `daysWithSlots` + `count`/`truncated`/`formattedSlots` từ `inRange` | 4, 5 |
| §3.5 instructions | 6 |
| §4 xử lý lỗi | 2 (parse fail → undefined), 3 (fallback), 4 (lọc im lặng), 5 (`outOfWindow`) |
| §5 test | 1, 2, 3, 4, 5, 7 |

Không có mục spec nào thiếu task.

**Type consistency:** `CalBookingWindow` định nghĩa ở Task 1 (`lib/booking-window.ts`), re-export ở Task 2 (`lib/calcom.ts`), tiêu thụ ở Task 3 (`AiBookingEventType.bookingWindow`) và Task 5 (`bookableUntil(aiEvent.bookingWindow, ...)`). `parseBookingWindow` khai báo Task 2, dùng Task 3. `bookableUntil` / `opensOn` khai báo Task 1, dùng Task 5. `inRange` tạo Task 4, dùng Task 5. Tên khớp xuyên suốt.

**Điểm cần chú ý khi thực thi:**
- Task 3 Step 3c: `.select()` hiện **chưa** có `raw` — quên thêm thì test fallback fail mà thông báo lỗi không nói rõ lý do.
- Task 5: `aiEvent.bookingWindow` chỉ tồn tại sau Task 3. Không đảo thứ tự 3 và 5.
- Task 4 phải xong trước Task 5 — Task 5 dùng `inRange`.
