# Nhắc lịch tự động (outbound reminders)

> **Superseded 2026-08-07.** Hệ thống reminder tự xây đã gỡ — xem `specs/2026-08-07-drop-custom-reminders-design.md`. Cal.com Workflow đảm nhiệm nhắc lịch.
>
> Trạng thái lịch sử: đã từng triển khai 2026-07-25; doc này giữ làm archival.
> Phụ thuộc (lúc viết): `guest-booking-change.md` (mã quản lý, `booking_verifications`), `guest-timezone.md` (giờ khách).
> Không phụ thuộc `setup-wizard-reorder.md` — hai việc song song được.

---

## 0. Vì sao là phần này

Ba lý do, xếp theo sức nặng:

1. **Đang bị bán mà chưa tồn tại.** [landing-page.tsx:71](app/_components/landing-page.tsx:71) — gói Premium $89, gói được đánh dấu `popular: true`, liệt kê **"Outbound reminders"**. Đây là món nợ trực tiếp nhất trên trang giá.

2. **Nó kích hoạt phần đã xây.** Hủy/đổi lịch qua chat và xử lý múi giờ là công sức lớn, nhưng khách chỉ dùng được nếu họ **quay lại chat**. Hiện không có gì đưa họ về. Nhắc lịch chính là cái đó. Không có nhắc lịch, toàn bộ luồng cancel/reschedule gần như không có lưu lượng.

3. **Là thứ duy nhất quy ra tiền được.** Chủ tiệm không tính được giá trị của "AI trả lời khách", nhưng tính được: một no-show = mất trọn một slot.

## 1. Chặn: repo chưa có bất kỳ hạ tầng chạy nền nào

Xác nhận bằng code:

- Không có `vercel.json` → không có cron.
- `syncCalBookingsToSupabase` **chỉ** được gọi từ [app/dashboard/bookings/actions.ts:37](app/dashboard/bookings/actions.ts:37) — tức là **nút bấm tay** trên dashboard.
- `ensureDigestNotifications` ([lib/notification-digests.ts:18](lib/notification-digests.ts:18)) cũng chỉ chạy ké theo sync thủ công.

Hệ quả ngoài chuyện nhắc lịch: **dữ liệu booking chỉ tươi khi có người bấm nút.** Khách hủy bên Cal.com thì hệ thống không biết cho tới lần bấm tiếp theo. Dashboard đang hiển thị dữ liệu cũ mà không ai nhận ra.

Nên bước đầu của plan này là dựng scheduler — và nó **sửa luôn** vấn đề trên. Một công đôi việc.

## 2. Kiến trúc scheduler

### Chọn Vercel Cron

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "*/15 * * * *" }
  ]
}
```

Lý do chọn Vercel Cron thay vì pg_cron/queue: đã deploy Vercel, không thêm dịch vụ, không thêm chi phí. Hobby plan giới hạn cron/ngày — kiểm tra hạn mức trước khi chốt tần suất.

### `app/api/cron/tick/route.ts`

**Xác thực bắt buộc.** Vercel gửi header `Authorization: Bearer ${CRON_SECRET}`. Route phải từ chối mọi request không khớp `process.env.CRON_SECRET` — nếu không, đây là endpoint public ai gọi cũng được, đốt Resend quota và spam khách.

Thứ tự trong mỗi tick (**không được đảo**):

1. `syncCalBookingsToSupabase` cho các workspace đang hoạt động → đảm bảo không nhắc lịch đã hủy bên Cal.com.
2. `ensureDigestNotifications`.
3. `sendDueReminders` (mục 3).

### Chọn workspace nào để quét

Quét toàn bộ workspace mỗi 15 phút sẽ không co giãn. Giới hạn: chỉ workspace **có booking sắp tới trong 48h** và `booking_reminders_enabled = true`. Một query lấy danh sách trước, rồi lặp.

`maxDuration` của route cần nâng (Vercel mặc định thấp). Nếu vượt, chuyển sang xử lý theo lô: mỗi tick làm N workspace, xoay vòng theo `last_reminder_scan_at`.

## 3. Migration — `2026XXXXXXXXXX_booking_reminders.sql`

```sql
-- Ghi nhận từng lần nhắc: chống gửi trùng
create table if not exists public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('reminder_24h', 'reminder_2h')),
  channel text not null default 'email',
  destination text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Chốt chặn chống gửi trùng — quan trọng nhất trong file này
create unique index if not exists booking_reminders_unique
  on public.booking_reminders (booking_id, kind, channel);

create index if not exists booking_reminders_due_idx
  on public.booking_reminders (status, scheduled_for)
  where status = 'pending';

alter table public.booking_reminders enable row level security;

create policy "Users can read workspace booking_reminders"
on public.booking_reminders
for select
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);
-- INSERT/UPDATE: service_role only (cron ghi)

-- Cài đặt theo tenant
alter table public.workspaces
  add column if not exists booking_reminders_enabled boolean not null default false,
  add column if not exists reminder_lead_minutes integer[] not null default '{1440,120}',
  add column if not exists reminder_quiet_hours int4range default '[21,8)';
```

**`booking_reminders_enabled` mặc định `false`** — không tự động gửi mail thay mặt tenant hiện có mà họ chưa đồng ý. Bật trong Settings.

**Unique index `(booking_id, kind, channel)` là tuyến phòng thủ chính.** Cron có thể chạy chồng (retry, deploy trùng lúc); idempotency phải nằm ở DB chứ không dựa vào logic ứng dụng.

## 4. Vấn đề khó nhất: làm sao khách quay lại chat để đổi lịch

Đây là chỗ plan này dễ hỏng nhất nếu không nghĩ trước.

Mã quản lý (`bookings.manage_code_hash`) **chỉ lưu dạng hash** — bản rõ chỉ tồn tại đúng một lần lúc `book_appointment` trả về. **Không thể lấy lại để nhét vào email nhắc lịch.** Cố tình lưu bản rõ là phá bỏ toàn bộ thiết kế bảo mật của `guest-booking-change.md`.

### Giải pháp: link một lần dùng (magic link)

Sinh token riêng cho mỗi lần nhắc, đặt trong URL:

```
https://{host}/b/{slug}?mt={token}
```

- Token = 32 byte ngẫu nhiên, **lưu hash** trong `booking_verifications` với `channel = 'manage_link'`, `booking_id` trỏ đúng booking, `expires_at` = giờ hẹn + 1h.
- Khi khách mở link, `app/b/[slug]/page.tsx` đọc `?mt=`, xác thực, rồi gọi `markBookingVerified()` (đã có sẵn tại [lib/agent-booking-auth.ts:490](lib/agent-booking-auth.ts:490)) cho `chat_session_id` vừa tạo → booking thành claimable ngay, khách chỉ cần gõ *"đổi lịch giúp tôi"*.
- **Xoá `mt` khỏi URL bằng `history.replaceState`** sau khi tiêu thụ, tránh token nằm lại trong lịch sử trình duyệt / ảnh chụp màn hình.
- Token dùng một lần: set `consumed_at` ngay.

Cần thêm `'manage_link'` vào `check` constraint của `booking_verifications.channel` (hiện chỉ có `manage_code | email_otp | phone_last4`).

> **Rủi ro cần ý thức:** ai đọc được email của khách thì đổi/hủy được lịch. Chấp nhận được — đây đúng bằng mức đảm bảo của link hủy lịch mà Cal.com đang gửi, và thấp hơn hậu quả của việc bắt khách nhớ mã.

## 5. Thời điểm gửi — quiet hours + múi giờ

Đây là chỗ phần `guest-timezone` vừa xây được dùng lại.

- Mốc mặc định: **24h** và **2h** trước giờ hẹn (`reminder_lead_minutes`).
- **Không gửi trong giờ yên lặng** (mặc định 21:00–08:00). Tính theo:
  - `bookings.guest_timezone` nếu có (workspace `online`),
  - ngược lại `workspaces.timezone`.
- Rơi vào giờ yên lặng → **dời tới 08:00** cùng múi giờ đó, không bỏ luôn.
- Mốc 2h mà rơi vào giờ yên lặng thì **bỏ** (`status = 'skipped'`) — dời sang sáng thì đã qua giờ hẹn, vô nghĩa.

### Mâu thuẫn cần chốt với cutoff hủy lịch

`workspaces.guest_change_cutoff_minutes` mặc định **120 phút**. Nhắc lịch mốc 2h rơi đúng ranh giới: khách nhận nhắc rồi bấm vào đổi lịch → bị từ chối vì đã quá hạn. Trải nghiệm tệ và trông như lỗi.

Hai cách, chọn một:
- **(khuyến nghị)** Mốc nhắc thứ hai đặt tại `guest_change_cutoff_minutes + 30 phút` thay vì cố định 120. Khách luôn còn ít nhất 30 phút để xử lý.
- Giữ 2h nhưng email mốc đó **không** kèm link đổi lịch, chỉ nhắc suông.

## 6. Nội dung email

Mở rộng `lib/email.ts` (đã có sẵn từ luồng OTP) — thêm `bookingReminderEmailCopy()` cạnh `bookingOtpEmailCopy()`.

Bắt buộc có:
- Tên doanh nghiệp, dịch vụ, **giờ hẹn hiển thị đúng múi giờ khách** (dùng `formatSlotForGuest` từ `lib/guest-timezone.ts`).
- Địa chỉ (onsite) hoặc link họp (online, từ `raw.meetingUrl`).
- Link quản lý (mục 4) — *"Cần đổi hoặc hủy? Bấm vào đây."*
- EN + VI theo `eve_guest_locale` / locale lúc đặt.

**Không được có:** mã quản lý (không lấy lại được), OTP, bất kỳ bí mật nào. `lib/chat-redact.ts` không bảo vệ email.

### Tuân thủ

Nhắc lịch là **email giao dịch** (transactional) nên không cần opt-in như marketing. Nhưng vẫn phải:
- Có cách từ chối nhận nhắc → link `/b/{slug}/unsubscribe?token=` hoặc cột `bookings.reminders_opt_out`.
- Không tái sử dụng địa chỉ này cho bất kỳ mục đích marketing nào.
- Ghi vào chính sách quyền riêng tư.

## 7. Dashboard

- **Settings:** bật/tắt nhắc lịch, chỉnh mốc thời gian, giờ yên lặng. Nêu rõ **cần cấu hình Resend domain**, nếu không email sẽ vào spam.
- **Bookings table:** cột/badge trạng thái nhắc (`sent` / `pending` / `failed`).
- **Notifications:** khi `failed` liên tục (ví dụ Resend từ chối domain), phát cảnh báo `ai_config` — chủ tiệm phải biết là nhắc lịch đang chết âm thầm.

## 8. Thứ tự triển khai

1. `vercel.json` + `app/api/cron/tick/route.ts` + xác thực `CRON_SECRET` (thêm vào `.env.example`)
2. Đưa `syncCalBookingsToSupabase` + `ensureDigestNotifications` vào tick ← **giá trị độc lập, ship được ngay**
3. Migration `booking_reminders` + cột workspace + thêm `'manage_link'` vào constraint channel
4. `lib/booking-reminders.ts` — quét booking đến hạn, dựng row `pending`, tính quiet hours/timezone
5. `lib/email.ts` — `bookingReminderEmailCopy()` EN/VI
6. Magic link: sinh token, `app/b/[slug]/page.tsx` tiêu thụ `?mt=` + `replaceState`
7. Gửi + cập nhật `status`/`attempts`/`error`, tôn trọng unique index
8. Settings + badge + cảnh báo thất bại → `npm run doctor`
9. Opt-out
10. `graphify update .`

**Bước 1–2 nên ship riêng trước.** Chúng sửa vấn đề dữ liệu cũ (sync thủ công) và không phụ thuộc phần còn lại.

## 9. Test

| # | Kịch bản | Kỳ vọng |
|---|----------|---------|
| 1 | Gọi `/api/cron/tick` không có `CRON_SECRET` | 401, không chạy gì |
| 2 | Chạy tick hai lần liên tiếp cho cùng booking | Chỉ **một** email — unique index chặn |
| 3 | Booking đã hủy bên Cal.com, chưa sync | Sync chạy trước → **không** gửi nhắc |
| 4 | Booking bị hủy giữa lúc row `pending` đã tạo | Kiểm tra lại trạng thái ngay trước khi gửi → `skipped` |
| 5 | Giờ hẹn 09:00, mốc 24h rơi vào 02:00 giờ khách | Dời tới 08:00, không gửi lúc 2 giờ sáng |
| 6 | Mốc thứ hai rơi vào giờ yên lặng | `skipped`, không dời |
| 7 | Workspace `online`, khách khác múi giờ | Email hiện giờ theo múi giờ khách |
| 8 | Bấm link quản lý trong email | Vào chat, booking claimable ngay, **không** hỏi mã |
| 9 | Bấm lại link đó lần hai | Từ chối (đã tiêu thụ) |
| 10 | Xem URL sau khi mở link | Không còn `?mt=` |
| 11 | `booking_reminders_enabled = false` | Không gửi gì |
| 12 | Gỡ `RESEND_API_KEY` | `status = 'failed'` + cảnh báo dashboard, cron **không** sập |
| 13 | Workspace 200 booking trong 48h | Tick xong trong `maxDuration`, hoặc chia lô đúng |

## 10. Giới hạn cần nói thẳng

- **Email nhắc lịch yếu hơn SMS/WhatsApp** đáng kể về tỷ lệ mở, nên tác động giảm no-show sẽ khiêm tốn hơn con số bạn dùng để bán hàng. Email là thứ **xây được ngay** vì `lib/email.ts` đã có. Kiến trúc `booking_reminders.channel` để sẵn `text` nên thêm kênh sau không phải migrate lại.
- **Vô dụng nếu domain Resend chưa verify** — vào spam là coi như không gửi. Đây là việc ops, không phải code, và là điều kiện cần trước khi bán tính năng này.
- **Vercel Cron không đảm bảo đúng giờ tuyệt đối.** Với độ hạt 15 phút thì không sao, nhưng đừng hứa "đúng 24 giờ trước".
- **Chưa xử lý booking định kỳ (recurring).** Cal.com có, hệ thống hiện tại chưa mô hình hóa. Phạm vi sau.
