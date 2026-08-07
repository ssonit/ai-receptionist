# Booking reminders + Cal.com sync — bỏ mô hình poll (thay `/api/cron/tick`)

**Date:** 2026-08-07  
**Status:** Design approved in conversation — chờ review file spec trước khi viết plan  
**Scope:** Thay cơ chế reminders/sync hiện tại (quét toàn bộ workspace mỗi 15 phút trong `/api/cron/tick`) bằng mô hình tính-lúc-tạo + giao qua QStash. Không đổi vai trò Cal.com làm booking/availability engine.  
**Phụ thuộc:** `docs/superpowers/outbound-reminders.md` (schema `booking_reminders` gốc — giữ nguyên, không đổi cột). Độc lập với `2026-08-07-cal-webhook-auto-register-design.md` — có thể ship theo thứ tự bất kỳ; reconciliation dự phòng trong doc này hoạt động dù webhook được đăng ký tự động hay thủ công.

## 1. Vấn đề hiện tại

Xác nhận trong code, không phải suy đoán:

- [app/api/cron/tick/route.ts](app/api/cron/tick/route.ts): mỗi 15 phút, quét TẤT CẢ workspace có booking trong 48h hoặc bật reminders, chạy tuần tự: sync Cal.com toàn bộ workspace → digest → prune rate-limit → reminders. Tất cả trong chung 1 cửa sổ `maxDuration = 60`.
- `outbound-reminders.md` (mục 2) đã tính trước phương án chia lô theo `last_reminder_scan_at` nếu vượt `maxDuration`, nhưng **chưa từng implement** — cột `workspaces.last_reminder_scan_at` tồn tại trong migration nhưng không có chỗ nào trong code đọc/ghi nó.
- Vì reminders là bước cuối trong chuỗi tuần tự, tenant tăng lên → sync+digest ăn hết ngân sách 60s → reminders có thể không chạy trong tick đó, không lỗi rõ ràng, chỉ lặng lẽ trễ.
- `lib/booking-reminders.ts` `scheduleForWorkspace()` quét lại toàn bộ booking trong cửa sổ lead-time mỗi lần gọi — không có khái niệm "đặt lịch nhắc 1 lần lúc tạo booking."
- Vercel Cron chỉ best-effort về thời điểm — chính doc gốc đã ghi "không đảm bảo đúng giờ tuyệt đối."

## 2. Quyết định thiết kế

| Chủ đề | Chọn |
|---|---|
| Nơi tính reminder | 1 lần lúc ghi `start_time` (tạo/đổi lịch), không rescan theo tick |
| Hook point tính | `lib/booking-create.ts` (tạo mới) + `lib/sync-cal-bookings.ts` `upsertCalBookings()` (cancel/reschedule/booking tạo ngoài eve) |
| Cơ chế giao đúng giờ | Upstash QStash — lên lịch 1 HTTP callback trễ tới `/api/reminders/send` mỗi reminder |
| Chống callback cũ (sau reschedule) | Guard tại endpoint: so `expectedScheduledFor` trong payload với `scheduled_for` hiện tại trong DB, lệch → no-op. Không hủy message QStash, không thêm cột |
| Schema `booking_reminders` | Không đổi — tái dùng unique index `(booking_id, kind, channel)` + `scheduled_for`/`status` sẵn có |
| Cal.com sync trong tick | Hạ xuống 1 lần/giờ, đổi vai trò từ "đường chính" thành "lưới an toàn dự phòng" (`/api/cal/webhook` đã là đường chính) |
| Digest + prune rate-limit | Tách khỏi reminders, chạy trong tick hourly, không phụ thuộc reminders/sync |
| Rollout | Song song với `sendDueReminders` cũ, backfill 1 lần cho booking tương lai đã tồn tại, xác nhận ổn rồi mới xoá nhánh cũ |

## 3. Kiến trúc

| Endpoint | Vai trò | Tần suất |
|---|---|---|
| `app/api/cal/webhook/route.ts` (không đổi) | Đường chính sync | Real-time |
| `app/api/reminders/send/route.ts` (mới) | Gửi đúng 1 reminder khi QStash gọi lại | Theo lịch riêng từng booking |
| `app/api/cron/tick/route.ts` (thu gọn) | Reconciliation dự phòng + digest + prune | 1 lần/giờ |

## 4. Reminders — chi tiết

### 4.1 Tính lúc tạo/đổi

Hàm mới, tái dùng `computeSchedule()` đã có trong `lib/booking-reminders.ts` (áp cho 1 booking thay vì quét cả workspace):

```
scheduleRemindersForBooking(bookingId, workspaceId):
  - load booking + workspace reminder settings
  - nếu !booking_reminders_enabled → return
  - với mỗi lead time trong effectiveLeadMinutes(): computeSchedule() → upsert booking_reminders (pending/skipped)
  - với mỗi row mới ở trạng thái pending → gọi qstashSchedule(reminderId, scheduledFor)
```

Gọi từ 2 nơi:

- `lib/booking-create.ts`, ngay sau upsert `bookings` thành công (đường AI chat + đường staff, cả hai đi qua đây theo comment đầu file).
- `lib/sync-cal-bookings.ts` `upsertCalBookings()`, trong khối so sánh `prev` vs `row` đã có (dòng 146-181): cancel → đánh `skipped` cho reminders pending của booking đó; đổi `start_time` → update lại `scheduled_for` trên đúng row hiện có (khớp unique index) + bắn QStash mới; booking mới thấy lần đầu qua sync/webhook (không tạo qua eve) → schedule như tạo mới.

### 4.2 Giao qua QStash — không cần cột mới

```
POST /api/reminders/send (nhận callback QStash)
  → verify chữ ký QStash (SDK @upstash/qstash, cùng tinh thần HMAC đã dùng ở Cal webhook)
  → payload { reminderId, expectedScheduledFor }
  → load lại row từ DB
  → nếu status != 'pending' HOẶC scheduled_for != expectedScheduledFor → no-op (callback cũ, đã bị thay)
  → ngược lại → gọi sendOneReminder() (đã có sẵn, lib/booking-reminders.ts:525) → cập nhật status
```

`sendOneReminder()` đã tồn tại độc lập — endpoint mới gần như chỉ là verify + guard + gọi hàm có sẵn.

## 5. Cal.com sync — vai trò trong doc này

Chỉ đổi tần suất/vai trò của `syncCalBookingsToSupabase` trong tick (15 phút → 1 giờ, đường chính → dự phòng). Việc tự động đăng ký webhook là phạm vi của [2026-08-07-cal-webhook-auto-register-design.md](2026-08-07-cal-webhook-auto-register-design.md) — doc này không phụ thuộc nó để ship.

## 6. Digest + prune rate-limit

Tách khỏi logic reminders/sync — chạy trong tick hourly, không có gì phức tạp thêm ngoài cắt dây khỏi nhánh reminders cũ.

## 7. Data model

Không có bảng/cột mới. `supabase/migrations/20260725000004_booking_reminders.sql` đã đủ. Chỉ thêm biến môi trường: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` vào `.env.example`.

`workspaces.last_reminder_scan_at` (có sẵn, chưa từng dùng) tiếp tục không dùng — không đề xuất xoá trong phạm vi doc này.

## 8. Rollout

1. Ship `scheduleRemindersForBooking` (2 hook point) + `/api/reminders/send` + QStash — giữ nguyên `sendDueReminders` trong tick chạy song song.
2. Backfill 1 lần: booking tương lai đã tồn tại trước khi đổi → chạy `scheduleForWorkspace()` (logic cũ) 1 lần để sinh `booking_reminders` + bắn QStash cho chúng.
3. Theo dõi vài ngày — so khớp QStash gửi vs tick gửi (không trùng nhờ unique index).
4. Xác nhận ổn → xoá nhánh `sendDueReminders` khỏi tick.
5. Hạ tick xuống hourly, tách digest/prune khỏi logic reminders (không bắt buộc tách file riêng).

## 9. Testing

Bảng test gốc trong `outbound-reminders.md` (mục 9) vẫn áp dụng. Bổ sung:

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Đổi lịch 2 lần liên tiếp trước khi reminder cũ kịp gửi | Chỉ callback ứng với `scheduled_for` mới nhất gửi thật, callback cũ no-op |
| 2 | QStash gọi lại nhưng booking đã bị huỷ trước đó | `status` đã `skipped` → callback no-op |
| 3 | QStash retry do endpoint timeout | `sendOneReminder` idempotent theo `status` hiện tại — không gửi trùng |
| 4 | Webhook Cal.com không tới (mất, chưa đăng ký) | Reconciliation hourly vẫn bắt được trong ≤1h |
| 5 | Workspace 200 booking tương lai lúc backfill | Backfill chạy theo lô, không timeout |

## 10. Ngoài phạm vi

- Tự động đăng ký webhook Cal.com — xem `2026-08-07-cal-webhook-auto-register-design.md`.
- Xoá cột `last_reminder_scan_at` — cleanup nhỏ, không cấp bách.
- SMS/WhatsApp reminders — kênh `channel` đã chừa sẵn trong schema, không làm ở đây.
