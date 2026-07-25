# Vá lỗi sau review — guest timezone

> Trạng thái: **plan vá, chưa code**. Viết ngày 2026-07-25.
> Áp lên bản triển khai của `guest-timezone.md` (đã code xong, typecheck sạch).
> 4 nhóm, làm theo thứ tự — #3 nên làm trước #1/#2 vì nó dọn đường cho cả hai.

---

## Tóm tắt

| # | Vấn đề | Mức | File chính |
|---|--------|-----|-----------|
| 1 | `reschedule_appointment` không trả dual timezone | 🔴 | `agent/tools/reschedule_appointment.ts` |
| 2 | Workspace `onsite` vẫn ghi/hiện timezone khách | 🟠 | `book_appointment.ts`, `list_my_appointments.ts` |
| 3 | 2 query tuần tự thừa mỗi lượt chat | 🟠 | `lib/workspace.ts`, `instructions.ts`, `check_availability.ts` |
| 4 | 3 chi tiết nhỏ (param chết, shape lệch, "la") | 🟡 | `check_availability.ts`, `guest-timezone.ts` |

---

## Fix #3 — Gom `service_mode` vào `getWorkspaceById` (làm TRƯỚC)

Làm đầu tiên vì #1 và #2 đều cần đọc `service_mode`; không gom trước thì hai fix kia lại đẻ thêm query rời.

### 3a. `lib/workspace.ts`

`getWorkspaceById` (~L90) hiện select thiếu `service_mode`. Sửa:

- Thêm `service_mode` vào chuỗi `.select(...)` (L95-97).
- Thêm `service_mode: WorkspaceServiceMode` vào type `WorkspaceTenant`.
- Map qua `parseServiceMode(data.service_mode)` từ `lib/guest-timezone.ts` khi build object trả về.

Sau bước này **mọi nơi cần service_mode đều lấy được từ `getWorkspaceById`**, không cần query riêng.

### 3b. `agent/tools/check_availability.ts`

Xoá khối query rời (`createAdminClient()` + `.from("workspaces").select("service_mode")`, ~L60-66) và import `createAdminClient` nếu không còn dùng. Đọc `ws.service_mode` từ `getWorkspaceById` đã gọi ở L58.

### 3c. `agent/instructions.ts`

`instructionsForCtx` (~L198-215) hiện chạy tuần tự 3 round-trip trước khi model sinh chữ:

```
workspaces.service_mode  →  resolveGuestTimeZone (chat_sessions)  →  buildMarkdown (fetchWorkspaceFaq)
```

Sửa thành:

- Bỏ query `service_mode` rời (dùng `getWorkspaceById`).
- `Promise.all` các phần độc lập:

```ts
const [ws, guestTz] = await Promise.all([
  getWorkspaceById(workspaceId),
  resolveGuestTimeZone({ auth, chatSessionId }),
]);
```

`buildMarkdown` vẫn tự gọi `fetchWorkspaceFaq` bên trong — nếu muốn triệt để thì hoisted luôn ra `Promise.all` và truyền vào, nhưng **không bắt buộc** ở đợt này (giữ diff nhỏ).

Lý do: vi phạm ưu tiên #1 trong `.claude/rules/vercel-react-conventions.md` (waterfall → `Promise.all`), và `instructionsForCtx` chạy **mỗi turn** nên latency cộng dồn.

---

## Fix #1 — `reschedule_appointment` trả dual timezone

**Triệu chứng:** khách London đổi lịch. `check_availability` nói đúng *"3:00 PM (your time) · 10:00 PM ICT"*, nhưng sau khi đổi xong tool chỉ trả `start` thô → agent xác nhận bằng giờ Việt Nam. Chính là mâu thuẫn mà plan gốc sinh ra để diệt, chỉ dời chỗ.

**File:** `agent/tools/reschedule_appointment.ts`

1. Import `formatSlotForGuest` từ `@/lib/guest-timezone` và `resolveGuestTimeZone` từ `@/lib/guest-timezone-resolve`.
2. Sau khi có `ws` + `timeZone` (L100-101), resolve guest tz — **gate theo `service_mode`** (xem #2):
   ```ts
   const guestTimeZone =
     ws?.service_mode === "online"
       ? (await resolveGuestTimeZone({ auth, chatSessionId: actor.chatSessionId })).guestTimeZone
       : null;
   ```
3. Trước `return` ở L215, dựng display cho giờ mới:
   ```ts
   const display = formatSlotForGuest(moved.start || newStart, guestTimeZone, timeZone);
   ```
4. Thêm vào object `booking` trong return (L216-223), khớp shape mà `book_appointment` đã dùng:
   ```ts
   display: display.combined,
   guestTimeZone,
   businessTimeZone: timeZone,
   ```
5. Cân nhắc thêm `previousDisplay` cho `booking.start_time` (giờ cũ) để agent nói được *"đã dời từ X sang Y"* bằng đúng múi giờ khách. Nice-to-have, không bắt buộc.

**Prompt:** `agent/instructions.ts` hard rules đã có *"After `book_appointment`, confirm using the booking `display` field"* — mở rộng câu đó để bao cả `reschedule_appointment`.

---

## Fix #2 — Gate `service_mode` cho ghi và hiển thị timezone khách

**Nguyên tắc #5 của plan gốc:** dịch vụ tại chỗ thì không đụng gì tới timezone khách. `check_availability` đã tôn trọng (L74). Hai tool còn lại thì chưa.

**Kịch bản hỏng:** khách đặt cắt tóc ở Hà Nội trong lúc công tác Singapore (hoặc bật VPN). Trình duyệt gửi `x-eve-tz: Asia/Singapore` → lưu vào `bookings.guest_timezone`. Tuần sau về nhà hỏi lại lịch → `list_my_appointments` hiển thị **giờ Singapore** cho một tiệm ở Hà Nội. Khách đến sai giờ.

### 2a. `agent/tools/book_appointment.ts`

L127-131 gọi `resolveGuestTimeZone()` vô điều kiện. Đã có `ws` từ L70 → chỉ ghi khi online:

```ts
const guestTimeZone =
  ws?.service_mode === "online" ? guestTzResolved.guestTimeZone : null;
```

`onsite` → `bookings.guest_timezone` là `null`, `startDisplay.combined` tự động rút về một chuỗi giờ doanh nghiệp (đã có sẵn nhánh này trong `formatSlotForGuest`, L247-255).

### 2b. `agent/tools/list_my_appointments.ts`

L36-38 gọi `resolveGuestTimeZone` làm fallback vô điều kiện. Đã có `ws` từ L34 → gate tương tự:

```ts
const fallbackGuestTimeZone =
  ws?.service_mode === "online" ? fallback.guestTimeZone : null;
```

Đồng thời trong `summarizeBookingCandidates` (`lib/agent-booking-auth.ts`), khi workspace là `onsite` thì **bỏ qua luôn `row.guest_timezone`** — dữ liệu cũ ghi trước fix 2a vẫn còn trong DB, không được để nó rò ra. Cách gọn nhất: thêm `opts.ignoreStoredGuestTz?: boolean`, hoặc để caller truyền thẳng `guestTimeZoneOverride: null`.

> **Quyết định cần chốt:** có backfill `update bookings set guest_timezone = null` cho workspace `onsite` không? Tôi nghiêng về **có** — dữ liệu đã ghi sai ngữ nghĩa, giữ lại chỉ tạo bug ngầm. Nếu chọn backfill thì viết migration mới, không sửa `20260725000002`.

### 2c. `components/bookings-table.tsx`

Dòng phụ *"Guest saw: ..."* (L555-560) nên ẩn khi workspace `onsite`. Truyền thêm prop `serviceMode` từ `app/dashboard/bookings/page.tsx` (page đã select `workspaces` rồi — chỉ cần thêm `service_mode` vào `.select(...)` ở L32).

---

## Fix #4 — Ba chi tiết nhỏ

### 4a. Xoá tham số `timeZone` chết khỏi `check_availability`

Schema vẫn khai báo `timeZone` với mô tả `"Ignored for Cal fetch — business timezone is always used"`, nhưng destructuring đã bỏ nó. Tham số bị ngó lơ trong âm thầm là bẫy: LLM sẽ truyền vào rồi tưởng có tác dụng.

Xoá hẳn khỏi `inputSchema`. Hành vi không đổi (đang bị bỏ qua sẵn rồi).

### 4b. Thống nhất shape `slotsByDay` vs `slots`

Hiện `slots` là object có `display`, còn `slotsByDay` vẫn là mảng ISO thô. Agent hoàn toàn có thể đọc `slotsByDay` rồi nêu giờ **không** kèm dual display — lách qua toàn bộ cơ chế vừa xây.

Chọn một:
- **(khuyến nghị)** `slotsByDay` chứa cùng object như `slots` (`{ start, display, ... }`); hoặc
- Bỏ hẳn `slotsByDay`, để agent tự nhóm từ `slots` — nhưng phải sửa prompt tương ứng.

Hướng đầu an toàn hơn, ít đụng prompt.

### 4c. `PLACE["la"]` khớp quá rộng

`lib/guest-timezone.ts` L35 có `"la": "America/Los_Angeles"`. Vòng partial match (L179-183) dùng `startsWith(\`${key} \`)` nên *"la habana"* → `America/Los_Angeles`. Sai.

Sửa: tách các key ngắn (≤ 2 ký tự: `la`, `uk`, `nyc` nếu muốn) ra khỏi nhánh partial match — chỉ cho khớp **chính xác**. Vòng partial chỉ chạy với key ≥ 3 ký tự.

---

## Thứ tự triển khai

1. **#3a** `getWorkspaceById` + `service_mode` (nền cho mọi thứ)
2. **#3b, #3c** bỏ query rời + `Promise.all`
3. **#2a, #2b** gate `book_appointment` / `list_my_appointments` (+ chốt backfill)
4. **#2c** prop `serviceMode` cho bookings-table
5. **#1** dual display cho reschedule + mở rộng hard rule trong prompt
6. **#4a, #4b, #4c** dọn dẹp
7. `npm run typecheck` → `npm run doctor` → `graphify update .`

---

## Test sau khi vá

| # | Kịch bản | Kỳ vọng |
|---|----------|---------|
| 1 | Workspace `online`, khách London đổi lịch | Xác nhận sau reschedule hiện **cả hai** giờ, giống lúc `check_availability` |
| 2 | Workspace `onsite`, khách đặt lịch qua VPN Singapore | `bookings.guest_timezone` = `null`; agent chỉ nói giờ doanh nghiệp |
| 3 | Tiếp #2, khách quay lại `list_my_appointments` từ máy khác | Vẫn hiện giờ doanh nghiệp, **không** nhảy sang giờ Singapore |
| 4 | Workspace `onsite`, dashboard bookings | Không có dòng "Guest saw: ..." |
| 5 | Booking cũ (đã lỡ ghi `guest_timezone` trước fix) ở workspace `onsite` | Không rò ra khách — dù backfill hay gate ở tầng đọc |
| 6 | Gõ "la habana" vào `set_guest_timezone` | Trả `null` + xin làm rõ, **không** ra `America/Los_Angeles` |
| 7 | Gõ "LA" | Vẫn ra `America/Los_Angeles` (khớp chính xác vẫn phải chạy) |
| 8 | Đo latency lượt chat đầu tiên trước/sau #3 | Giảm ~1-2 round-trip DB |
| 9 | Workspace `online`, `check_availability` | `slotsByDay` và `slots` cùng shape, đều có `display` |

## Lưu ý khi code

- **Không đổi `formatSlotForGuest`.** Nó đã xử lý đúng cả hai nhánh (guest null → rút về một chuỗi). Mọi fix ở #2 chỉ là truyền `null` vào đúng lúc, không sửa hàm format.
- **Không sửa migration `20260725000002` đã tồn tại** — nếu cần backfill thì viết file mới (`.claude/rules/supabase-migrations.md`).
- `service_mode` thêm vào `WorkspaceTenant` sẽ chạm nhiều call site của `getWorkspaceById` — chỉ thêm field, không đổi field cũ, nên không phải sửa nơi khác. Chạy typecheck để chắc.
