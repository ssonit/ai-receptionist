# Drop Custom Reminders Implementation Plan

> **For agentic workers:** **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy (tiền lệ: `docs/superpowers/plans/2026-07-26-cal-key-tool-errors.md`, `2026-08-07-cal-webhook-auto-register.md`). Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng. **Commit từng task một**, message rõ ràng. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gỡ toàn bộ hệ thống booking-reminder tự xây (bảng `booking_reminders`, code tính lịch/gửi, magic link, unsubscribe, UI cấu hình). Cal.com Workflow (cấu hình thủ công phía tenant, ngoài phạm vi code Eve) đảm nhiệm việc gửi email nhắc lịch; luồng cancel/reschedule qua chat AI giữ nguyên — đã có 5 lớp xác thực không cần magic link (`agent/skills/booking_change.md`), không mất chức năng gì.

**Architecture:** Xoá theo cụm phụ thuộc — cụm "magic link" (3 file liên kết chặt: `lib/manage-link.ts`, `components/strip-manage-link-param.tsx`, nhánh `?mt=` trong `app/b/[slug]/page.tsx`) xoá cùng lúc để tránh import treo giữa các bước. `/api/cron/tick` chỉ bỏ 1 nhánh gọi, phần sync (dự phòng, webhook đã là chính) + digest + prune giữ nguyên. Database: 1 migration mới drop bảng + cột — không sửa migration cũ.

**Tech Stack:** Next.js, Supabase, vitest.

## Global Constraints

- **Không tạo branch/worktree, commit từng task, thẳng vào `main`.**
- Đây là plan **gỡ bỏ**, không phải thêm tính năng — không có "viết test fail trước" theo kiểu TDD cổ điển cho việc xoá. Thay vào đó mỗi task: xoá → `grep` xác nhận không còn tham chiếu treo → `npm run typecheck` → chạy test liên quan (nếu có) → `npm run test` toàn bộ ở task cuối.
- **Không xoá `guest_change_cutoff_minutes`** (cột + logic) — dùng chung cho guest cancel/reschedule nói chung, không phải riêng reminders. Chỉ xoá phần lead-time/quiet-hours/enabled thật sự thuộc reminders.
- **Không đổi** `agent/tools/cancel_appointment.ts`, `reschedule_appointment.ts`, `agent/skills/booking_change.md`, sync Cal.com (`lib/sync-cal-bookings.ts`, `app/api/cal/webhook/`) — không liên quan, không đụng.
- Sau mỗi task sửa code: `graphify update .`.
- Sau task sửa `.tsx`: `npm run doctor`.
- Nguồn: `docs/superpowers/specs/2026-08-07-drop-custom-reminders-design.md` (đã duyệt), thay thế `2026-08-07-booking-reminders-event-driven-design.md` (đã đánh dấu superseded, không triển khai).

---

### Task 1: `/api/cron/tick` — bỏ nhánh reminders, giãn tần suất cron

**Files:**
- Modify: `app/api/cron/tick/route.ts`
- Modify: `vercel.json`

**Interfaces:** Không export mới. `GET()` giữ chữ ký, response bỏ field `reminders`.

- [ ] **Bước 1: Xoá import + lời gọi `sendDueReminders`**

Trong `app/api/cron/tick/route.ts`, xoá dòng đầu file:

```ts
import { sendDueReminders } from "@/lib/booking-reminders";
```

Xoá khối (nằm sau đoạn prune rate-limit, trước `return Response.json(...)`):

```ts
  let reminders: Awaited<ReturnType<typeof sendDueReminders>> | null = null;
  try {
    reminders = await sendDueReminders({ workspaceIds });
  } catch (error) {
    console.error("[cron/tick] reminders failed", error);
    reminders = {
      scheduled: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : "reminders failed",
    };
  }
```

Sửa `return Response.json({...})` cuối file — bỏ field `reminders,`:

```ts
  return Response.json({
    ok: true,
    workspaces: workspaceIds.length,
    sync: syncResults,
  });
```

- [ ] **Bước 2: Bỏ nhánh "reminder-enabled" khỏi `workspaceIdsForTick()`**

Hàm này hiện lấy workspace theo 2 điều kiện: có booking trong 48h HOẶC `booking_reminders_enabled = true`. Vì cột đó sắp bị xoá khỏi schema (Task 7), chỉ giữ điều kiện "có booking trong 48h" (phục vụ sync dự phòng). Thay:

```ts
async function workspaceIdsForTick(): Promise<string[]> {
  const supabase = createAdminClient();
  const now = Date.now();
  const horizon = new Date(now + 48 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  const [{ data: upcoming }, { data: reminderWs }] = await Promise.all([
    supabase
      .from("bookings")
      .select("workspace_id")
      .gte("start_time", nowIso)
      .lte("start_time", horizon)
      .not("status", "ilike", "%cancel%")
      .limit(2000),
    supabase
      .from("workspaces")
      .select("id")
      .eq("booking_reminders_enabled", true)
      .limit(500),
  ]);

  const ids = new Set<string>();
  for (const row of upcoming ?? []) {
    if (row.workspace_id) ids.add(row.workspace_id as string);
  }
  for (const row of reminderWs ?? []) {
    if (row.id) ids.add(row.id as string);
  }
  return [...ids];
}
```

bằng:

```ts
async function workspaceIdsForTick(): Promise<string[]> {
  const supabase = createAdminClient();
  const now = Date.now();
  const horizon = new Date(now + 48 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data: upcoming } = await supabase
    .from("bookings")
    .select("workspace_id")
    .gte("start_time", nowIso)
    .lte("start_time", horizon)
    .not("status", "ilike", "%cancel%")
    .limit(2000);

  const ids = new Set<string>();
  for (const row of upcoming ?? []) {
    if (row.workspace_id) ids.add(row.workspace_id as string);
  }
  return [...ids];
}
```

Nếu code thật đã lệch so với đoạn trên (file có thể đổi kể từ lúc viết plan), chạy trước:

```bash
grep -n "booking_reminders_enabled" app/api/cron/tick/route.ts
```

và áp cùng nguyên tắc (bỏ nhánh `reminderWs`, giữ nhánh `upcoming`) theo code thật.

- [ ] **Bước 3: Giãn tần suất cron — không còn gì cần 15 phút**

Sửa `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/tick",
      "schedule": "0 * * * *"
    }
  ]
}
```

(mỗi giờ — sync giờ là dự phòng sau webhook, digest/prune không nhạy thời gian).

- [ ] **Bước 4: Typecheck**

```bash
npm run typecheck
```

- [ ] **Bước 5: `graphify update .` + commit**

```bash
graphify update .
git add app/api/cron/tick/route.ts vercel.json graphify-out
git commit -m "feat(cron): drop reminders branch from tick, widen interval to hourly"
```

---

### Task 2: Xoá cụm "magic link" — 3 file liên kết chặt

**Files:**
- Delete: `lib/manage-link.ts`
- Delete: `components/strip-manage-link-param.tsx`
- Delete: `lib/booking-reminders.ts`
- Delete: `lib/booking-reminders.test.ts`
- Modify: `lib/email.ts`
- Modify: `app/b/[slug]/page.tsx`

**Interfaces:** Không còn export nào từ 2 file bị xoá được dùng ở đâu khác sau task này (xác nhận ở Bước 3).

- [ ] **Bước 1: Xoá 4 file**

```bash
git rm lib/manage-link.ts components/strip-manage-link-param.tsx lib/booking-reminders.ts lib/booking-reminders.test.ts
```

- [ ] **Bước 2: Xoá `bookingReminderEmailCopy()` khỏi `lib/email.ts`**

Xoá toàn bộ hàm (dòng 72-137 tính tới lúc viết plan này — xác nhận lại số dòng thật trước khi xoá vì file có thể đã đổi):

```bash
grep -n "^export function bookingReminderEmailCopy" lib/email.ts
```

Xoá từ dòng đó tới trước `export function workspaceInviteEmailCopy`. Giữ nguyên `sendTransactionalEmail`, `bookingOtpEmailCopy`, `workspaceInviteEmailCopy`, `escapeHtml`, `escapeAttr`.

- [ ] **Bước 3: Sửa `app/b/[slug]/page.tsx` — bỏ nhánh `?mt=`**

Xoá 2 import:

```ts
import { StripManageLinkParam } from "@/components/strip-manage-link-param";
import { consumeManageLink } from "@/lib/manage-link";
```

Sửa `PageProps`, bỏ `mt` khỏi `searchParams`:

```ts
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, never>>;
};
```

(Nếu component khác trong cùng file cần `searchParams` cho việc khác, giữ kiểu tối thiểu đúng thực tế — kiểm tra trước khi ép về `Record<string, never>`.)

Trong `PublicBookingSlugPage`, xoá:

```ts
  const { mt } = await searchParams;
  ...
  let preferChatSessionId: string | null = null;
  let manageLinkNotice: string | null = null;
  const mtToken = mt?.trim() || "";

  if (mtToken) {
    const result = await consumeManageLink({...});
    ... // toàn bộ khối if/else if/else xử lý mtToken
  }
```

Bỏ luôn `<StripManageLinkParam enabled={Boolean(mtToken)} />` trong JSX, và 2 prop `manageLinkNotice`/`preferChatSessionId` khỏi `<WorkspaceBookingPage ... />` — **nhưng trước khi xoá 2 prop này, kiểm tra `workspace-booking-page.tsx` có dùng chúng cho việc gì khác ngoài magic link không:**

```bash
grep -n "manageLinkNotice\|preferChatSessionId" app/_components/workspace-booking-page.tsx
```

Nếu file đó cũng chỉ dùng 2 prop này cho hiển thị thông báo magic-link → xoá luôn phần nhận/dùng chúng ở đó (prop type + JSX hiển thị `manageLinkNotice`, logic dùng `preferChatSessionId` để chọn session). Nếu dùng cho việc khác nữa → giữ lại, chỉ bỏ phần liên quan magic link, ghi chú lại trong commit message.

Xoá `ANALYTICS_EVENT`/`trackServer` import khỏi file này nếu không còn chỗ nào khác dùng (kiểm tra trước khi xoá, file có thể dùng cho việc khác).

- [ ] **Bước 4: Grep xác nhận không còn tham chiếu treo**

```bash
grep -rn "booking-reminders\|manage-link\|strip-manage-link-param\|bookingReminderEmailCopy\|consumeManageLink" --include=*.ts --include=*.tsx . | grep -v "node_modules\|docs/superpowers"
```

Kỳ vọng: rỗng (docs được loại trừ vì lịch sử quyết định vẫn nhắc tên các file này, không sao).

- [ ] **Bước 5: Typecheck + test**

```bash
npm run typecheck
npm run test
```

Kỳ vọng: exit 0 cả hai. Test nào từng cover `lib/booking-reminders.ts`/`lib/manage-link.ts` giờ đã bị xoá cùng file nguồn ở Bước 1 — không còn gì để chạy hỏng.

- [ ] **Bước 6: `graphify update .` + commit**

```bash
graphify update .
git add -A
git commit -m "feat(reminders): remove magic-link mechanism (booking-reminders, manage-link, mt= param handling)"
```

---

### Task 3: Xoá trang unsubscribe

**Files:**
- Delete: `app/b/[slug]/unsubscribe/page.tsx`
- Delete: `app/b/[slug]/unsubscribe/actions.ts`
- Delete: `app/b/[slug]/unsubscribe/unsubscribe-confirm-form.tsx`

- [ ] **Bước 1: Kiểm tra không nơi nào khác link tới trang này**

```bash
grep -rn "unsubscribe" --include=*.ts --include=*.tsx app lib components | grep -v "app/b/\[slug\]/unsubscribe"
```

Nếu có kết quả (vd. link "Huỷ nhận nhắc lịch" trong email copy đã xoá ở Task 2, hoặc chỗ khác) — xác nhận nguồn đó cũng đã/sẽ bị xoá, không còn trỏ tới route sắp mất.

- [ ] **Bước 2: Xoá thư mục**

```bash
git rm -r app/b/\[slug\]/unsubscribe
```

- [ ] **Bước 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Bước 4: `graphify update .` + commit**

```bash
graphify update .
git add -A
git commit -m "feat(reminders): remove guest unsubscribe page (no longer sending reminders to opt out of)"
```

---

### Task 4: Dashboard Settings — bỏ UI + action cấu hình reminders

**Files:**
- Modify: `app/dashboard/settings/actions.ts`
- Modify: `app/_components/workspace-settings-form.tsx`
- Modify: `app/dashboard/settings/page.tsx`

**Interfaces:** `saveWorkspaceSettings()` giữ chữ ký, không còn ghi 4 cột reminder.

- [ ] **Bước 1: `app/dashboard/settings/actions.ts` — bỏ phần reminder**

Xoá import (dòng 9, 14 tính tới lúc viết plan — xác nhận lại số dòng):

```ts
  reminderLeadTooShortMessage,
```
```ts
import { minLongLeadMinutes } from "@/lib/booking-reminders";
```

Kiểm tra `reminderLeadTooShortMessage` không dùng chỗ khác trong file trước khi xoá import:

```bash
grep -n "reminderLeadTooShortMessage" app/dashboard/settings/actions.ts
```

Xoá khối tính giá trị (giữ nguyên `guestChangeCutoffMinutes` phía trên nó — KHÔNG xoá):

```ts
  const bookingRemindersEnabled =
    formData.get("bookingRemindersEnabled") === "on";

  const reminderLeadMinutesRaw = String(
    formData.get("reminderLeadMinutes") ?? "",
  ).trim();
  const reminderLeadMinutesInRange = reminderLeadMinutesRaw
    ? reminderLeadMinutesRaw
        .split(/[,\s]+/)
        .map((p) => Math.floor(Number(p)))
        .filter((n) => Number.isFinite(n) && n >= 60 && n <= 10080)
    : [];
  const reminderLeadMinutes =
    reminderLeadMinutesInRange.length > 0 ? reminderLeadMinutesInRange : [1440];

  // A lead too close to the cancel/reschedule cutoff collapses into the
  // short-lead slot and is silently dropped at send time — reject here
  // instead, so the owner sees why their value "didn't stick".
  if (bookingRemindersEnabled) {
    const minLead = minLongLeadMinutes(guestChangeCutoffMinutes);
    if (reminderLeadMinutes.some((n) => n <= minLead)) {
      return { error: reminderLeadTooShortMessage(minLead) };
    }
  }
```

Xoá 4 field khỏi object truyền cho `.update(...)`:

```ts
      booking_reminders_enabled: bookingRemindersEnabled,
      reminder_lead_minutes: reminderLeadMinutes,
      reminder_quiet_start: (() => {
        const parsed = Number(formData.get("reminderQuietStart"));
        if (!Number.isFinite(parsed)) return 21;
        return Math.min(23, Math.max(0, Math.floor(parsed)));
      })(),
      reminder_quiet_end: (() => {
        const parsed = Number(formData.get("reminderQuietEnd"));
        if (!Number.isFinite(parsed)) return 8;
        return Math.min(23, Math.max(0, Math.floor(parsed)));
      })(),
```

- [ ] **Bước 2: `app/_components/workspace-settings-form.tsx` — xoá cả khối `SettingsSection id="reminders"`**

Xoá nguyên khối (mở đầu `<SettingsSection description="Email guests before appointments..." id="reminders" title="Reminders">`, đóng bằng `</SettingsSection>` ngay trước phần `{publicBookingUrl ? (...`):

```bash
grep -n 'id="reminders"' app/_components/workspace-settings-form.tsx
```

Xoá từ dòng `<SettingsSection` đó tới đúng `</SettingsSection>` khớp cặp (không xoá lố sang section `public-link` ngay sau). Xoá luôn dòng trống thừa nếu còn 2 dòng trống liên tiếp sau khi xoá.

- [ ] **Bước 3: `app/dashboard/settings/page.tsx` — bỏ 4 cột khỏi query + prop**

```bash
grep -n "booking_reminders_enabled\|reminder_lead_minutes\|reminder_quiet_start\|reminder_quiet_end" app/dashboard/settings/page.tsx
```

Xoá 4 tên cột đó khỏi chuỗi `.select(...)` (giữ nguyên các cột khác, kể cả `guest_change_cutoff_minutes`, `cal_webhook_synced_at`...). Xoá phần map 4 giá trị này sang camelCase khi build object `workspace` truyền vào `<WorkspaceSettingsForm workspace={...} />` (đọc quanh khu vực map `cal_webhook_synced_at`/`hasOwnWebhookSecret` đã có ở đó làm mẫu cấu trúc tương tự).

- [ ] **Bước 4: Typecheck**

```bash
npm run typecheck
```

Nếu báo lỗi "Property 'bookingRemindersEnabled' does not exist" ở đâu đó còn sót — quay lại xoá chỗ đó.

- [ ] **Bước 5: `npm run doctor`**

```bash
npm run doctor
```

Sửa mọi cảnh báo trước khi coi xong.

- [ ] **Bước 6: Kiểm chứng thủ công**

```bash
npm run dev
```

Mở `/dashboard/settings`, xác nhận không còn section "Reminders", các section khác (Booking policy, Webhook, Public link...) vẫn nguyên vẹn, form vẫn lưu được (thử đổi tên workspace, lưu, xác nhận thành công).

- [ ] **Bước 7: `graphify update .` + commit**

```bash
graphify update .
git add app/dashboard/settings app/_components/workspace-settings-form.tsx graphify-out
git commit -m "feat(settings): remove reminders configuration UI and action fields"
```

---

### Task 5: Bookings table — bỏ badge trạng thái nhắc lịch

**Files:**
- Modify: `components/bookings-table.tsx`

- [ ] **Bước 1: Xoá field type**

```ts
  /** Latest reminder status across kinds (for badge). */
  reminder_status?: "pending" | "sent" | "failed" | "skipped" | null;
```

- [ ] **Bước 2: Xoá khối render badge**

```tsx
          {booking.reminder_status === "sent" ? (
            <Badge variant="secondary" className="text-xs">
              Reminder sent
            </Badge>
          ) : booking.reminder_status === "pending" ? (
            <Badge variant="outline" className="text-xs">
              Reminder pending
            </Badge>
          ) : booking.reminder_status === "failed" ? (
            <Badge variant="destructive" className="text-xs">
              Reminder failed
            </Badge>
          ) : null}
```

(Nằm ngay sau khối `Cancelled on Cal.com` / `Cancelled by staff` — xoá đúng khối reminder, giữ nguyên khối cancelled.)

- [ ] **Bước 3: Kiểm tra không còn nơi nào populate `reminder_status` khi query bookings**

```bash
grep -rn "reminder_status" app lib components
```

Nếu còn chỗ SELECT `reminder_status` (subquery join `booking_reminders` để tính badge) — xoá luôn phần đó, vì bảng `booking_reminders` sắp bị drop (Task 7).

- [ ] **Bước 4: Typecheck + doctor**

```bash
npm run typecheck
npm run doctor
```

- [ ] **Bước 5: `graphify update .` + commit**

```bash
graphify update .
git add components/bookings-table.tsx graphify-out
git commit -m "feat(bookings): remove reminder status badge"
```

(Nếu Bước 3 phát hiện thêm file cần sửa, `git add` file đó cùng commit này.)

---

### Task 6: Sửa copy marketing

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/vi.json`

- [ ] **Bước 1: Xoá 2 chỗ trong `messages/en.json`**

Xoá dòng (trong danh sách tính năng gói giá):

```json
        "reminders": "Appointment reminders",
```

Xoá khối (trong phần features section):

```json
        "remind": {
          "title": "Reminders",
          "body": "Auto-reminders so fewer empty chairs."
        },
```

Kiểm tra dấu phẩy JSON hợp lệ sau khi xoá (phần tử cuối trong object không được có dấu phẩy thừa).

- [ ] **Bước 2: Xoá 2 chỗ tương ứng trong `messages/vi.json`**

```json
        "reminders": "Nhắc lịch hẹn",
```

```json
        "remind": {
          "title": "Nhắc lịch",
          "body": "Tự động nhắc lịch để giảm khách không đến."
        },
```

- [ ] **Bước 3: Xác nhận JSON hợp lệ**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/vi.json','utf8')); console.log('ok')"
```

Kỳ vọng: in `ok`, không throw.

- [ ] **Bước 4: Kiểm chứng thủ công**

```bash
npm run dev
```

Mở `/` (landing page), xác nhận không còn mục "Reminders" trong phần tính năng, chuyển sang tiếng Việt (nếu có toggle) xác nhận tương tự.

- [ ] **Bước 5: Commit**

```bash
git add messages/en.json messages/vi.json
git commit -m "content: remove reminders from marketing copy — Cal.com Workflow owns this now, not Eve"
```

---

### Task 7: Migration — drop bảng + cột reminders

**Files:**
- Create: `supabase/migrations/20260807000001_drop_booking_reminders.sql`

- [ ] **Bước 1: Xác nhận timestamp chưa trùng**

```bash
ls supabase/migrations | tail -5
```

- [ ] **Bước 2: Viết migration**

```sql
-- Bỏ hệ thống reminder tự xây — Cal.com Workflow đảm nhiệm việc nhắc lịch
-- (quyết định 2026-08-07, xem docs/superpowers/specs/2026-08-07-drop-custom-reminders-design.md).

drop table if exists public.booking_reminders;

alter table public.workspaces
  drop column if exists booking_reminders_enabled,
  drop column if exists reminder_lead_minutes,
  drop column if exists reminder_quiet_start,
  drop column if exists reminder_quiet_end,
  drop column if exists last_reminder_scan_at;

alter table public.bookings
  drop column if exists reminders_opt_out;
```

Không đổi `booking_verifications.channel` check constraint (vẫn cho phép giá trị `'manage_link'` dù không còn ai ghi) — việc dọn nhỏ, không đáng thêm rủi ro cho 1 migration khác chỉ để giữ constraint "sạch".

- [ ] **Bước 3: Áp migration cục bộ**

```bash
npx supabase db reset
```

Kỳ vọng: chạy xong không lỗi. Xác nhận bảng `booking_reminders` không còn, 5 cột trên không còn (Supabase Studio hoặc `\d`).

- [ ] **Bước 4: Test toàn bộ suite sau khi đổi schema**

```bash
npm run test
```

Kỳ vọng: exit 0 — nếu có test nào seed dữ liệu vào các cột/bảng vừa xoá (kiểm tra `tests/helpers/supabase-mock.ts` và các file seed `booking_reminders`/cột reminder), sửa hoặc xoá phần seed đó trước khi coi task xong.

- [ ] **Bước 5: `graphify update .` + commit**

```bash
graphify update .
git add supabase/migrations/20260807000001_drop_booking_reminders.sql graphify-out
git commit -m "feat(db): drop booking_reminders table and reminder columns"
```

---

### Task 8: Xác nhận toàn cục + dọn

**Files:** không sửa, chỉ kiểm chứng.

- [ ] **Bước 1: Grep toàn repo lần cuối**

```bash
grep -rln "booking_reminders\|bookingReminders\|reminder_lead_minutes\|reminderLeadMinutes\|reminder_quiet\|reminderQuiet\|manage-link\|manageLink\|bookingReminderEmailCopy" --include=*.ts --include=*.tsx --include=*.sql . | grep -v "node_modules\|docs/superpowers\|graphify-out"
```

Kỳ vọng: rỗng. Bất kỳ file nào còn lọt qua đây nghĩa là 1 trong 7 task trên bỏ sót — quay lại sửa.

- [ ] **Bước 2: Full verification**

```bash
npm run typecheck
npm run test
npm run doctor:full
```

Kỳ vọng: cả 3 exit 0 / không lỗi mới.

- [ ] **Bước 3: Kiểm chứng thủ công end-to-end**

```bash
npm run dev
```

- Đặt lịch thử qua `/b/[slug]` chat (hoặc `/chat` Pilot) — vẫn hoạt động bình thường.
- Vào chat gõ "tôi muốn đổi lịch" mà không có link đặc biệt nào — xác nhận AI hỏi mã quản lý/OTP/SĐT (theo `agent/skills/booking_change.md`) và xử lý được, không nhắc gì tới reminder.
- `/dashboard/settings` không còn phần Reminders, các phần khác còn nguyên.
- `/dashboard/bookings` không còn badge "Reminder sent/pending/failed".
- `/` không còn nhắc "Reminders" trong tính năng.

- [ ] **Bước 4: Cập nhật `docs/superpowers/specs/2026-08-07-drop-custom-reminders-design.md`**

Thêm dòng vào đầu file (dưới `**Status:**`): `**Implemented:** 2026-08-07 — xem 8 commit trong plan.` — đánh dấu đã triển khai xong, khớp quy ước `2026-07-29-cal-oauth-client-design.md` từng làm.

```bash
git add docs/superpowers/specs/2026-08-07-drop-custom-reminders-design.md
git commit -m "docs(specs): mark drop-custom-reminders as implemented"
```

## Self-review trước khi đóng plan

- [ ] Không task nào đụng `agent/tools/cancel_appointment.ts`, `reschedule_appointment.ts`, `agent/skills/booking_change.md`, hoặc bất kỳ file sync Cal.com nào (Global Constraints).
- [ ] `guest_change_cutoff_minutes` không bị xoá ở Task 4 — chỉ 4 field reminder-riêng bị xoá.
- [ ] Task 2 xoá đúng cụm 4 file liên kết + sửa 2 file phụ thuộc chúng trong cùng 1 task — không để trạng thái nửa vời (file bị xoá nhưng vẫn có import trỏ tới) lọt qua giữa các commit.
- [ ] Task 7 (migration) đứng sau Task 1/4/5 (code đã hết đọc/ghi các cột đó) — không drop schema trước khi code ngừng dùng nó.
- [ ] Task 8 Bước 1 là lưới an toàn cuối — nếu nó tìm thấy gì, đừng bỏ qua, quay lại task tương ứng.
