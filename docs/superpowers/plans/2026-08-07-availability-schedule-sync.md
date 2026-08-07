# Availability Schedule Sync Implementation Plan

> **For agentic workers:** **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree (tiền lệ: `2026-07-26-cal-key-tool-errors.md`, `2026-08-07-cal-webhook-auto-register.md`). Bỏ qua bước `using-git-worktrees` nếu dùng `executing-plans`/`subagent-driven-development`. **Commit từng task một.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ tiệm sửa giờ làm việc ngay trong `/dashboard/settings`, đồng bộ với lịch mặc định trên Cal.com — không cần vào `app.cal.com/availability` nữa. `workspaces.business_hours` (hiển thị cho khách/AI) tự sinh từ giờ thật, bỏ ô nhập tay.

**Architecture:** 3 hàm mới trong `lib/calcom.ts` (đọc/tạo/sửa schedule mặc định), 1 formatter thuần trong `lib/workspace-schedule.ts`, 1 card UI mới trong Settings gọi cả 2. Gỡ ô nhập `business_hours` khỏi `workspace-agent-studio.tsx` (giữ nguyên `about`/`services_summary` dùng chung component).

**Tech Stack:** Next.js, Cal.com API v2, vitest.

## Global Constraints

- Không tạo branch/worktree, commit từng task, thẳng `main`.
- **Không đụng** `about`/`services_summary` state/UI trong `workspace-agent-studio.tsx`, không đụng `parseBulletLines`/`serializeBulletLines`/`looksLikeBulletList` (dùng chung, vẫn cần cho 2 field kia).
- Không mirror schedule vào Supabase — đọc/ghi trực tiếp Cal.com mỗi lần.
- `cal-api-version` cho nhóm `/schedules`: `2024-06-11` — **chưa xác nhận qua response thật**, kiểm chứng ở Task 5, sửa lại `SCHEDULES_API_VERSION` nếu sai.
- Sau mỗi task sửa code: `graphify update .`. Sau task sửa `.tsx`: `npm run doctor`.
- Nguồn: `docs/superpowers/specs/2026-08-07-availability-schedule-sync-design.md`.

---

### Task 1: `lib/calcom.ts` — đọc/tạo/sửa schedule mặc định

**Files:**
- Modify: `lib/calcom.ts`

**Interfaces:**
- Produces: `CalSchedule`, `CalScheduleAvailability`, `UpsertScheduleInput` types; `getDefaultSchedule(): Promise<CalSchedule | null>`, `createSchedule(input): Promise<CalSchedule>`, `updateSchedule(id, input): Promise<CalSchedule>` — Task 3 dùng cả 3.

Không viết test trực tiếp cho bước này — đúng quy ước file (`getAvailableSlots`/`createBooking`/`listWebhooks` cũng không có test trực tiếp, chỉ test qua nơi gọi, xem Task 3).

- [ ] **Bước 1: Thêm type + 3 hàm**

Thêm vào cuối `lib/calcom.ts`:

```ts
export type CalScheduleAvailability = {
  days: string[];
  startTime: string;
  endTime: string;
};

export type CalSchedule = {
  id: number;
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability: CalScheduleAvailability[];
};

export type UpsertScheduleInput = {
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability: CalScheduleAvailability[];
};

// Xác nhận qua ví dụ docs, chưa test với response thật — verify Task 5.
const SCHEDULES_API_VERSION = "2024-06-11";

function parseCalSchedule(item: Record<string, unknown>): CalSchedule | null {
  if (typeof item.id !== "number") return null;
  if (typeof item.name !== "string") return null;
  if (typeof item.timeZone !== "string") return null;
  return {
    id: item.id,
    name: item.name,
    timeZone: item.timeZone,
    isDefault: Boolean(item.isDefault),
    availability: Array.isArray(item.availability)
      ? (item.availability as CalScheduleAvailability[])
      : [],
  };
}

/**
 * GET /v2/schedules/default — null when the account has no default
 * schedule yet (new Cal.com account) OR the response doesn't parse into a
 * real schedule. A genuine network/auth failure still throws (calFetch's
 * normal behavior) — only "call succeeded but nothing usable came back"
 * turns into null. Verify in Task 5 which case Cal.com actually returns.
 */
export async function getDefaultSchedule(): Promise<CalSchedule | null> {
  requireCalApiKey();
  const body = await calFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    "/schedules/default",
    { method: "GET", apiVersion: SCHEDULES_API_VERSION },
  );
  const data = (body.data ?? body) as Record<string, unknown>;
  return parseCalSchedule(data);
}

/** POST /v2/schedules */
export async function createSchedule(input: UpsertScheduleInput): Promise<CalSchedule> {
  requireCalApiKey();
  const body = await calFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    "/schedules",
    { method: "POST", apiVersion: SCHEDULES_API_VERSION, body: JSON.stringify(input) },
  );
  const data = (body.data ?? body) as Record<string, unknown>;
  const parsed = parseCalSchedule(data);
  if (!parsed) {
    throw new Error("Cal.com create schedule response missing id/name/timeZone");
  }
  return parsed;
}

/** PATCH /v2/schedules/{id} */
export async function updateSchedule(
  id: number,
  input: UpsertScheduleInput,
): Promise<CalSchedule> {
  requireCalApiKey();
  const body = await calFetch<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    `/schedules/${id}`,
    { method: "PATCH", apiVersion: SCHEDULES_API_VERSION, body: JSON.stringify(input) },
  );
  const data = (body.data ?? body) as Record<string, unknown>;
  const parsed = parseCalSchedule(data);
  if (!parsed) {
    throw new Error("Cal.com update schedule response missing id/name/timeZone");
  }
  return parsed;
}
```

- [ ] **Bước 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Bước 3: `graphify update .` + commit**

```bash
graphify update .
git add lib/calcom.ts graphify-out
git commit -m "feat(calcom): add default-schedule read/create/update"
```

---

### Task 2: Formatter `business_hours` từ schedule thật

**Files:**
- Create: `lib/workspace-schedule.ts`
- Test: `lib/workspace-schedule.test.ts`

**Interfaces:**
- Consumes: `CalScheduleAvailability` (Task 1).
- Produces: `formatScheduleAsBusinessHours(availability: CalScheduleAvailability[], locale: "en" | "vi"): string` — Task 3 dùng khi lưu.

- [ ] **Bước 1: Viết test trước**

```ts
// lib/workspace-schedule.test.ts
import { describe, expect, it } from "vitest";
import { formatScheduleAsBusinessHours } from "./workspace-schedule";

describe("formatScheduleAsBusinessHours", () => {
  it("formats Mon-Fri same hours as one line, Vietnamese", () => {
    const result = formatScheduleAsBusinessHours(
      [
        {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
      "vi",
    );
    expect(result).toBe("- Thứ 2–Thứ 6: 09:00–17:00");
  });

  it("formats Mon-Fri same hours as one line, English", () => {
    const result = formatScheduleAsBusinessHours(
      [
        {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
      "en",
    );
    expect(result).toBe("- Mon–Fri: 09:00–17:00");
  });

  it("formats multiple non-contiguous day groups as separate lines", () => {
    const result = formatScheduleAsBusinessHours(
      [
        { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "17:00" },
        { days: ["Saturday"], startTime: "09:00", endTime: "12:00" },
      ],
      "vi",
    );
    expect(result).toBe("- Thứ 2–Thứ 6: 09:00–17:00\n- Thứ 7: 09:00–12:00");
  });

  it("returns a closed-days notice when availability is empty", () => {
    const result = formatScheduleAsBusinessHours([], "vi");
    expect(result).toBe("- Chưa thiết lập giờ làm việc");
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận thất bại (module chưa tồn tại)**

```bash
npm run test -- lib/workspace-schedule.test.ts
```

- [ ] **Bước 3: Viết `lib/workspace-schedule.ts`**

```ts
import type { CalScheduleAvailability } from "@/lib/calcom";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_LABEL: Record<string, { vi: string; en: string }> = {
  Monday: { vi: "Thứ 2", en: "Mon" },
  Tuesday: { vi: "Thứ 3", en: "Tue" },
  Wednesday: { vi: "Thứ 4", en: "Wed" },
  Thursday: { vi: "Thứ 5", en: "Thu" },
  Friday: { vi: "Thứ 6", en: "Fri" },
  Saturday: { vi: "Thứ 7", en: "Sat" },
  Sunday: { vi: "Chủ nhật", en: "Sun" },
};

function dayRangeLabel(days: string[], locale: "en" | "vi"): string {
  const ordered = DAY_ORDER.filter((d) => days.includes(d));
  if (ordered.length === 0) return "";
  if (ordered.length === 1) return DAY_LABEL[ordered[0]][locale];

  // Contiguous run in DAY_ORDER → "A–B"; otherwise list each day.
  const indices = ordered.map((d) => DAY_ORDER.indexOf(d));
  const isContiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1,
  );
  if (isContiguous) {
    const dash = locale === "vi" ? "–" : "–";
    return `${DAY_LABEL[ordered[0]][locale]}${dash}${DAY_LABEL[ordered[ordered.length - 1]][locale]}`;
  }
  return ordered.map((d) => DAY_LABEL[d][locale]).join(", ");
}

export function formatScheduleAsBusinessHours(
  availability: CalScheduleAvailability[],
  locale: "en" | "vi",
): string {
  if (availability.length === 0) {
    return locale === "vi" ? "- Chưa thiết lập giờ làm việc" : "- Hours not set yet";
  }

  return availability
    .map((slot) => {
      const label = dayRangeLabel(slot.days, locale);
      return `- ${label}: ${slot.startTime}–${slot.endTime}`;
    })
    .join("\n");
}
```

- [ ] **Bước 4: Chạy lại test**

```bash
npm run test -- lib/workspace-schedule.test.ts
```

Kỳ vọng: PASS cả 4 case.

- [ ] **Bước 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Bước 6: `graphify update .` + commit**

```bash
graphify update .
git add lib/workspace-schedule.ts lib/workspace-schedule.test.ts graphify-out
git commit -m "feat(workspace): format Cal.com schedule into business_hours display text"
```

---

### Task 3: UI "Working hours" trong Settings

**Files:**
- Create: `app/_components/working-hours-card.tsx`
- Modify: `app/dashboard/settings/page.tsx`
- Modify: `app/dashboard/settings/actions.ts`
- Test: `app/dashboard/settings/actions.test.ts` (file mới nếu chưa có — kiểm tra trước)

**Interfaces:**
- Consumes: `getDefaultSchedule`/`createSchedule`/`updateSchedule` (Task 1), `formatScheduleAsBusinessHours` (Task 2), `getCalAccessTokenForWorkspace`/`withCalApiKey` (đã có).
- Produces: `saveWorkingHoursAction(workspaceId, input): Promise<{ ok: true } | { ok: false; error: string }>` trong `app/dashboard/settings/actions.ts`.

- [ ] **Bước 1: Kiểm tra có test file nào sẵn cho `settings/actions.ts` chưa**

```bash
ls app/dashboard/settings/*.test.ts 2>/dev/null
```

Nếu có, thêm case mới vào file đó thay vì tạo file mới trùng tên.

- [ ] **Bước 2: Viết test cho action mới (thất bại — chưa có hàm)**

```ts
// app/dashboard/settings/actions.test.ts (thêm nếu file đã tồn tại, tạo mới nếu chưa)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    getDefaultSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    withCalApiKey: (_key: string, fn: () => unknown) => fn(),
  };
});
vi.mock("@/lib/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace")>();
  return { ...actual, getCalAccessTokenForWorkspace: vi.fn().mockResolvedValue("token") };
});
vi.mock("@/lib/workspace-invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace-invites")>();
  return {
    ...actual,
    requireOwnerWorkspace: vi.fn().mockResolvedValue({
      ok: true,
      workspaceId: WS_ID,
      supabase: undefined,
    }),
  };
});

const WS_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("saveWorkingHoursAction", () => {
  it("updates the existing default schedule and refreshes business_hours", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, timezone: "Asia/Ho_Chi_Minh" }]);
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getDefaultSchedule).mockResolvedValue({
      id: 42,
      name: "Working Hours",
      timeZone: "Asia/Ho_Chi_Minh",
      isDefault: true,
      availability: [],
    });
    vi.mocked(calcom.updateSchedule).mockResolvedValue({
      id: 42,
      name: "Working Hours",
      timeZone: "Asia/Ho_Chi_Minh",
      isDefault: true,
      availability: [
        { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "17:00" },
      ],
    });

    const { saveWorkingHoursAction } = await import("./actions");
    const result = await saveWorkingHoursAction(WS_ID, {
      days: [
        { day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Tuesday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Wednesday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Thursday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Friday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Saturday", enabled: false, startTime: "09:00", endTime: "17:00" },
        { day: "Sunday", enabled: false, startTime: "09:00", endTime: "17:00" },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(calcom.updateSchedule).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        availability: [
          { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "17:00" },
        ],
      }),
    );
    const ws = supabaseMock.getRows("workspaces")[0];
    expect(ws.business_hours).toContain("09:00");
  });

  it("creates a schedule when the account has none yet", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, timezone: "Asia/Ho_Chi_Minh" }]);
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getDefaultSchedule).mockResolvedValue(null);
    vi.mocked(calcom.createSchedule).mockResolvedValue({
      id: 99,
      name: "Working Hours",
      timeZone: "Asia/Ho_Chi_Minh",
      isDefault: true,
      availability: [{ days: ["Monday"], startTime: "09:00", endTime: "17:00" }],
    });

    const { saveWorkingHoursAction } = await import("./actions");
    const result = await saveWorkingHoursAction(WS_ID, {
      days: [{ day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" }],
    });

    expect(result).toEqual({ ok: true });
    expect(calcom.createSchedule).toHaveBeenCalled();
    expect(calcom.updateSchedule).not.toHaveBeenCalled();
  });

  it("returns ok:false without throwing when Cal.com rejects (e.g. missing OAuth scope)", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, timezone: "Asia/Ho_Chi_Minh" }]);
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getDefaultSchedule).mockRejectedValue(
      new Error("Cal.com request failed (403)"),
    );

    const { saveWorkingHoursAction } = await import("./actions");
    const result = await saveWorkingHoursAction(WS_ID, {
      days: [{ day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" }],
    });

    expect(result.ok).toBe(false);
  });
});
```

Điều chỉnh mock `requireOwnerWorkspace`/tham số thật của `saveWorkingHoursAction` theo đúng chữ ký `requireOwnerWorkspace()` hiện có trong `lib/workspace-invites.ts` — đọc file đó trước khi code Bước 4 nếu hình dạng khác giả định trên.

- [ ] **Bước 3: Chạy test, xác nhận thất bại**

```bash
npm run test -- app/dashboard/settings/actions.test.ts
```

- [ ] **Bước 4: Viết `saveWorkingHoursAction` trong `app/dashboard/settings/actions.ts`**

```ts
import {
  createSchedule,
  getDefaultSchedule,
  updateSchedule,
  withCalApiKey,
  type CalScheduleAvailability,
} from "@/lib/calcom";
import { formatScheduleAsBusinessHours } from "@/lib/workspace-schedule";
import { getCalAccessTokenForWorkspace } from "@/lib/workspace";

export type WorkingHoursDayInput = {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  enabled: boolean;
  startTime: string;
  endTime: string;
};

function toAvailability(days: WorkingHoursDayInput[]): CalScheduleAvailability[] {
  // Group consecutive enabled days sharing the same start/end into one
  // entry — matches how Cal.com's own UI represents "Mon–Fri 9-5" as a
  // single availability object rather than 5 separate ones.
  const enabled = days.filter((d) => d.enabled);
  const groups: CalScheduleAvailability[] = [];
  for (const d of enabled) {
    const last = groups[groups.length - 1];
    if (last && last.startTime === d.startTime && last.endTime === d.endTime) {
      last.days.push(d.day);
    } else {
      groups.push({ days: [d.day], startTime: d.startTime, endTime: d.endTime });
    }
  }
  return groups;
}

export async function saveWorkingHoursAction(
  workspaceId: string,
  input: { days: WorkingHoursDayInput[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok || auth.workspaceId !== workspaceId) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    const token = await getCalAccessTokenForWorkspace(workspaceId);
    const availability = toAvailability(input.days);

    const schedule = await withCalApiKey(token, async () => {
      const existing = await getDefaultSchedule();
      if (existing) {
        return updateSchedule(existing.id, {
          name: existing.name,
          timeZone: existing.timeZone,
          isDefault: true,
          availability,
        });
      }
      return createSchedule({
        name: "Working Hours",
        timeZone: existing?.timeZone ?? "UTC",
        isDefault: true,
        availability,
      });
    });

    const businessHours = formatScheduleAsBusinessHours(schedule.availability, "vi");
    const admin = createAdminClient();
    await admin
      .from("workspaces")
      .update({ business_hours: businessHours })
      .eq("id", workspaceId);

    revalidatePath(DASHBOARD_PATH.settings);
    revalidatePath(DASHBOARD_PATH.agent);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save working hours";
    return { ok: false, error: message };
  }
}
```

Đọc phần đầu `app/dashboard/settings/actions.ts` hiện có trước khi dán — file đã import sẵn `requireOwnerWorkspace`, `appErrorMessage`, `APP_ERROR_CODE`, `revalidatePath`, `DASHBOARD_PATH` (dùng lại, không import trùng). Cần thêm import `createAdminClient` từ `@/lib/supabase/admin` nếu file chưa có.

**Lỗi timeZone khi tạo mới lần đầu (`existing?.timeZone ?? "UTC"` khi `existing` là `null`):** nên lấy timezone thật của workspace (`workspaces.timezone`, không phải literal `"UTC"`) — sửa lại truy vấn 1 cột `timezone` từ `workspaces` trước khi gọi `createSchedule` cho case này, đừng để mặc định `UTC` sai lệch với múi giờ tiệm thật.

- [ ] **Bước 5: Chạy lại test**

```bash
npm run test -- app/dashboard/settings/actions.test.ts
```

Kỳ vọng: PASS cả 3 case.

- [ ] **Bước 6: Viết `WorkingHoursCard` — component client**

```tsx
// app/_components/working-hours-card.tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWorkingHoursAction, type WorkingHoursDayInput } from "@/app/dashboard/settings/actions";

const DAYS: { key: WorkingHoursDayInput["day"]; label: string }[] = [
  { key: "Monday", label: "Thứ 2" },
  { key: "Tuesday", label: "Thứ 3" },
  { key: "Wednesday", label: "Thứ 4" },
  { key: "Thursday", label: "Thứ 5" },
  { key: "Friday", label: "Thứ 6" },
  { key: "Saturday", label: "Thứ 7" },
  { key: "Sunday", label: "Chủ nhật" },
];

type Props = {
  workspaceId: string;
  initialDays: WorkingHoursDayInput[];
};

export function WorkingHoursCard({ workspaceId, initialDays }: Props) {
  const [days, setDays] = useState(initialDays);
  const [pending, startTransition] = useTransition();

  const update = (key: WorkingHoursDayInput["day"], patch: Partial<WorkingHoursDayInput>) => {
    setDays((prev) => prev.map((d) => (d.day === key ? { ...d, ...patch } : d)));
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveWorkingHoursAction(workspaceId, { days });
      if (result.ok) toast.success("Đã lưu giờ làm việc.");
      else toast.error(result.error);
    });
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      <div className="space-y-4">
        <div>
          <p className="font-medium text-foreground">Giờ làm việc</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đồng bộ trực tiếp với lịch mặc định trên Cal.com — không cần vào Cal.com để sửa.
          </p>
        </div>
        {DAYS.map(({ key, label }) => {
          const day = days.find((d) => d.day === key)!;
          return (
            <div key={key} className="flex items-center gap-3">
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
                <input
                  checked={day.enabled}
                  type="checkbox"
                  onChange={(e) => update(key, { enabled: e.target.checked })}
                />
                {label}
              </label>
              <Input
                className="w-28"
                disabled={!day.enabled}
                type="time"
                value={day.startTime}
                onChange={(e) => update(key, { startTime: e.target.value })}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                className="w-28"
                disabled={!day.enabled}
                type="time"
                value={day.endTime}
                onChange={(e) => update(key, { endTime: e.target.value })}
              />
            </div>
          );
        })}
        <Button disabled={pending} onClick={handleSave}>
          {pending ? "Đang lưu…" : "Lưu giờ làm việc"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Bước 7: Gắn vào `app/dashboard/settings/page.tsx`**

Đọc phần Server Component hiện tại trước khi sửa (mẫu đã có cho `WebhookSecretCard` — cùng khu vực). Thêm gọi `getDefaultSchedule()` (qua `withCalApiKey(await getCalAccessTokenForWorkspace(dashboard.workspaceId), ...)`) lúc render trang, map kết quả sang `WorkingHoursDayInput[]` (7 ngày, ngày không có trong `availability` trả về → `enabled: false`, giờ mặc định `09:00`/`17:00`). Bọc try/catch — nếu Cal.com lỗi (chưa connect, 403...), truyền mảng 7 ngày mặc định tắt hết, không chặn render trang. Render `<WorkingHoursCard workspaceId={dashboard.workspaceId} initialDays={...} />` cạnh `<WebhookSecretCard ... />`.

- [ ] **Bước 8: Typecheck + doctor**

```bash
npm run typecheck
npm run doctor
```

- [ ] **Bước 9: Kiểm chứng thủ công**

```bash
npm run dev
```

Vào `/dashboard/settings`, xác nhận card "Giờ làm việc" hiện ra, sửa 1 ngày, bấm Lưu, kiểm tra toast thành công/lỗi hợp lý.

- [ ] **Bước 10: `graphify update .` + commit**

```bash
graphify update .
git add app/_components/working-hours-card.tsx app/dashboard/settings graphify-out
git commit -m "feat(settings): add working-hours card synced with Cal.com default schedule"
```

---

### Task 4: Gỡ ô nhập tay `business_hours` khỏi trang Agent

**Files:**
- Modify: `app/_components/workspace-agent-studio.tsx`
- Modify: `app/dashboard/agent/actions.ts`

**Interfaces:** Không đổi chữ ký `saveAgentSettingsAction` (hay tên thật — xác nhận ở Bước 1) ngoài việc bớt 1 field đọc từ `formData`.

- [ ] **Bước 1: Đọc lại toàn bộ đoạn liên quan `businessHours`/`hoursRawMode`/`hourLines` trong `workspace-agent-studio.tsx`**

```bash
grep -n "businessHours\|hoursRawMode\|hourLines" app/_components/workspace-agent-studio.tsx
```

Đối chiếu từng dòng với bản đã xác nhận lúc viết plan này (dòng ~169-182, ~238-241, ~353, ~683-693, ~839-881) — số dòng có thể lệch nếu file đã đổi. Đọc đủ ngữ cảnh quanh mỗi cụm trước khi xoá, để không xoá lố sang phần `servicesRawMode`/`about` (2 field đó **giữ nguyên**, dùng chung `parseBulletLines`/`serializeBulletLines`/`looksLikeBulletList`).

- [ ] **Bước 2: Xoá state riêng cho `businessHours`**

Xoá:
```ts
const [hoursRawMode, setHoursRawMode] = useState(
  () => !looksLikeBulletList(workspace?.businessHours),
);
```
```ts
const [businessHours, setBusinessHours] = useState(
  workspace?.businessHours ?? "",
);
const [hourLines, setHourLines] = useState(() =>
  parseBulletLines(workspace?.businessHours),
);
```

Trong `useEffect` đồng bộ lại state khi `workspace` đổi, xoá 3 dòng:
```ts
setBusinessHours(workspace?.businessHours ?? "");
setHourLines(parseBulletLines(workspace?.businessHours));
setHoursRawMode(!looksLikeBulletList(workspace?.businessHours));
```
(giữ nguyên `setAbout`, `setServicesSummary`, `setServiceTags`, `setServicesRawMode`).

- [ ] **Bước 3: Xoá hidden input**

```ts
<input name="business_hours" type="hidden" value={businessHours} />
```

- [ ] **Bước 4: Xoá khối UI "Hours"**

Tìm section có label `"Hours"` (đối chiếu section `"Services"` ngay cạnh làm ranh giới — section Services **giữ nguyên**, chỉ xoá section Hours). Xoá toàn bộ khối hiển thị badge + nút chuyển raw/bullet mode + input cho Hours, giữ nguyên cấu trúc tương tự cho Services.

- [ ] **Bước 5: `app/dashboard/agent/actions.ts` — bỏ ghi `business_hours`**

Xoá dòng:
```ts
business_hours: optionalText(formData, "business_hours"),
```
khỏi object truyền cho `.update(...)` (dòng ~95 tính tới lúc viết plan — xác nhận lại). Giữ nguyên `about`, `services_summary`, `agent_instructions`, `agent_display_name` và các field khác trong cùng object.

- [ ] **Bước 6: Grep xác nhận không còn tham chiếu treo**

```bash
grep -n "businessHours\|hoursRawMode\|hourLines" app/_components/workspace-agent-studio.tsx
```

Kỳ vọng: rỗng.

- [ ] **Bước 7: Typecheck + doctor**

```bash
npm run typecheck
npm run doctor
```

- [ ] **Bước 8: Kiểm chứng thủ công**

```bash
npm run dev
```

Vào `/dashboard/agent`, xác nhận không còn phần "Hours", phần "Services"/"About" vẫn hoạt động bình thường (sửa, lưu, xác nhận thành công).

- [ ] **Bước 9: `graphify update .` + commit**

```bash
graphify update .
git add app/_components/workspace-agent-studio.tsx app/dashboard/agent/actions.ts graphify-out
git commit -m "feat(agent): remove manual business_hours entry — auto-generated from Cal.com schedule now"
```

---

### Task 5: Xác minh thật với tài khoản Cal.com

Giống hệt vai trò Task 7 trong plan webhook — không có tài khoản Cal.com thật trong CI, cần làm thủ công.

- [ ] **Bước 1: Xác nhận `cal-api-version` đúng cho `/schedules`**

Gọi thử `GET /v2/schedules/default` với API key thật (curl hoặc qua UI vừa build). Nếu lỗi phiên bản/field lạ, đọc response thật, sửa `SCHEDULES_API_VERSION` (Task 1) hoặc field trong `parseCalSchedule`/`toAvailability` cho khớp.

- [ ] **Bước 2: Xác nhận hành vi khi chưa có schedule mặc định**

Tài khoản Cal.com mới, gọi `GET /v2/schedules/default` — ghi lại: trả 404 hay 200 với body rỗng/null? Nếu 404 thật, `calFetch` sẽ throw thay vì để `getDefaultSchedule()` trả `null` êm — cần bọc try/catch quanh lời gọi trong `saveWorkingHoursAction` (Task 3) để phân biệt "thật sự lỗi" vs "chưa có schedule, đi tạo mới". Sửa lại nếu cần.

- [ ] **Bước 3: Test OAuth thiếu scope `SCHEDULE_WRITE`**

Workspace test đang ở `cal_auth_mode = 'oauth'`, thử lưu giờ làm việc. Xác nhận lỗi 401/403 hiện đúng trong toast (không phải crash trang), và ghi lại — nếu xác nhận thiếu scope thật, đây là việc **ngoài phạm vi plan này** (giống webhook: cần thêm `SCHEDULE_WRITE` vào `CAL_OAUTH_SCOPES`, chờ Cal.com duyệt lại, tenant OAuth phải Connect lại).

- [ ] **Bước 4: Test với API key**

Workspace test dùng `cal_api_key_encrypted`, lưu giờ làm việc, xác nhận trên `app.cal.com/availability` thấy đúng giờ vừa lưu từ dashboard eve.

- [ ] **Bước 5: Dọn workspace test**

Khôi phục giờ làm việc gốc trên Cal.com nếu cần, tránh để lại dữ liệu test.

## Self-review trước khi đóng plan

- [ ] Task 4 không đụng `about`/`services_summary` — chỉ xoá đúng phần `businessHours`/`hoursRawMode`/`hourLines`.
- [ ] Task 3 lấy `timezone` thật của workspace khi tạo schedule mới lần đầu, không hardcode `"UTC"` (đã sửa trong Bước 4).
- [ ] `getDefaultSchedule`/`createSchedule`/`updateSchedule` tên field nhất quán giữa Task 1 và Task 3 (`availability`, `timeZone`, `isDefault`, `id`, `name`).
- [ ] Task 5 Bước 2 là chỗ duy nhất chưa chắc chắn (404 vs 200-rỗng) — không bị bỏ ngỏ, có bước xác minh + sửa rõ ràng.
- [ ] Không mirror schedule vào Supabase ở đâu — chỉ `business_hours` (text hiển thị) được ghi lại, đúng quyết định trong spec.
