# Bỏ hệ thống reminder tự xây — dùng Cal.com Workflow

**Date:** 2026-08-07  
**Status:** Design approved in conversation — chờ review file spec trước khi viết plan  
**Scope:** Gỡ toàn bộ `booking_reminders` (bảng, code tính lịch/gửi, UI cấu hình, magic link, unsubscribe). Cal.com Workflow đảm nhiệm việc gửi email nhắc lịch; luồng cancel/reschedule qua chat AI giữ nguyên, không cần magic link để kích hoạt.  
**Phụ thuộc:** Thay thế hoàn toàn `2026-08-07-booking-reminders-event-driven-design.md` (đã đánh dấu superseded). Không liên quan `2026-08-07-cal-webhook-auto-register-design.md` (đã triển khai, không đổi gì ở đây).

## 1. Vì sao đổi hướng

Ba câu hỏi đặt ra trong lúc bàn, câu trả lời cho từng cái quyết định hướng này:

1. **Cal.com có tự làm được việc "nhắc lịch" không?** Có — tính năng **Workflows**, có sẵn từ gói Free (mẫu mặc định, không tuỳ biến được nội dung), hỗ trợ trigger "gửi trước giờ hẹn N phút", cả email lẫn SMS/WhatsApp.
2. **Nếu để Cal.com gửi nhắc, khách quay lại chat AI để đổi/huỷ lịch bằng cách nào — không có magic link thì sao?** Đã có sẵn, không cần code thêm: [agent/skills/booking_change.md](../../../agent/skills/booking_change.md) định nghĩa 5 lớp xác thực không cần magic link — `list_my_appointments` (cùng phiên chat) → mã quản lý → OTP email → 4 số cuối SĐT → escalate nhân viên. Khách tự vào web, gõ "tôi muốn đổi lịch", AI xử lý được ngay hôm nay.
3. **Vercel Cron 15 phút cho reminders có đáng để giữ không, khi chưa có khách hàng?** Không — chi phí thực tế gần như 0 (workspace loop rỗng), nhưng vẫn là hạ tầng phục vụ tính năng chưa ai bật. Bỏ hẳn code reminders cũng bỏ luôn lý do duy nhất khiến tick cần chạy dày.

Kết luận: Cal.com lo "nhắc lịch", Eve lo "AI receptionist + đổi/huỷ lịch qua chat" — ranh giới rõ, không trùng việc.

## 2. Đánh đổi cần chấp nhận (nói thẳng, không giấu)

| # | Vấn đề | Mức độ |
|---|---|---|
| 1 | Cal.com Workflows **không có API để tạo/sửa** cho tài khoản cá nhân (xác nhận qua [github.com/calcom/cal.com/issues/25560](https://github.com/calcom/cal.com/issues/25560), còn mở tính tới lúc viết doc này) — mỗi chủ tiệm phải tự vào Cal.com bật Workflow, Eve không tự động hoá được như đã làm với webhook. | Chấp nhận cho MVP — việc thủ công phía tenant, không phải lỗi Eve. |
| 2 | Gói Free của Cal.com chỉ có **mẫu email mặc định**, không song ngữ, không thương hiệu tiệm. | Chấp nhận cho MVP — khách đọc được nội dung cơ bản, chưa tối ưu trải nghiệm. |
| 3 | `messages/en.json`/`vi.json` đang quảng cáo "Appointment reminders"/"Nhắc lịch hẹn" như tính năng riêng của Eve. | Phải sửa — gỡ khỏi danh sách tính năng Eve tự nhận, vì Eve không còn sở hữu việc này (đúng theo định vị Cal.com lo booking+reminder / Eve lo AI receptionist). |

## 3. Phạm vi gỡ bỏ

Chi tiết đầy đủ + từng file nằm trong plan implement (`docs/superpowers/plans/2026-08-07-drop-custom-reminders.md`). Tóm tắt:

- **Xoá hẳn:** `lib/booking-reminders.ts` (+ test), `lib/manage-link.ts`, `components/strip-manage-link-param.tsx`, `app/b/[slug]/unsubscribe/` (cả thư mục).
- **Sửa:** `app/api/cron/tick/route.ts` (bỏ nhánh reminders), `vercel.json` (giãn tần suất — không còn gì cần 15 phút), `lib/email.ts` (bỏ `bookingReminderEmailCopy`), `app/dashboard/settings/actions.ts` + `workspace-settings-form.tsx` + `settings/page.tsx` (bỏ UI/logic cấu hình reminder), `components/bookings-table.tsx` (bỏ badge trạng thái nhắc), `app/b/[slug]/page.tsx` (bỏ xử lý `?mt=`), `messages/en.json` + `vi.json` (sửa copy).
- **Migration mới:** drop bảng `booking_reminders`, drop cột reminder trên `workspaces`/`bookings`.
- **Không đổi:** đặt/huỷ/đổi lịch qua chat, sync Cal.com (webhook + reconciliation vừa làm), `guest_change_cutoff_minutes` (dùng chung cho guest cancel/reschedule, không riêng reminders).

## 4. Nếu sau này cần lại

Cal.com Workflows có thể mở API (issue #25560 đang xin đúng việc này) — lúc đó có thể để Cal.com lo hạ tầng gửi, Eve chỉ tự động hoá việc **bật Workflow hộ tenant** (giống pattern webhook auto-register đã làm) thay vì tự xây lại pipeline gửi/schedule. Không cần tính trước, chỉ ghi lại hướng nếu quay lại vấn đề này.
