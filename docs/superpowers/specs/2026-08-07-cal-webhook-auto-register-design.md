# Cal.com webhook tự động đăng ký + idempotency

**Date:** 2026-08-07  
**Status:** Design approved in conversation — chờ review file spec trước khi viết plan  
**Scope:** Tự động tạo webhook Cal.com lúc workspace connect (API key hoặc OAuth), thay cho việc chủ tiệm tự dán URL+secret. Sửa 1 gap idempotency thật (analytics đếm trùng khi Cal.com gửi lại webhook).  
**Phụ thuộc:** Độc lập với `2026-08-07-booking-reminders-event-driven-design.md` — không chặn nhau về mặt kỹ thuật. **Ưu tiên hiện tại (quyết định 2026-08-07): làm doc này trước, doc reminders + mọi thay đổi `/api/cron/tick` tạm gác lại.** Vì vậy webhook là đường sync duy nhất cho booking tạo/đổi trực tiếp trên Cal.com trong giai đoạn này — không có lưới an toàn dạng cron — nên thiết kế ở mục 3.4 (tự phục hồi không qua cron) là bắt buộc, không phải tùy chọn. Liên quan trực tiếp tới amendment 2026-08-07 trong `2026-07-29-cal-oauth-client-design.md` (giữ paste API key sống).

## 1. Hiện trạng

- `app/api/cal/webhook/route.ts` đã là đường sync chính, verify HMAC đúng chuẩn Cal.com (`x-cal-signature-256`, HMAC-SHA256 trên raw body — khớp tài liệu Cal.com, xem Sources).
- Đăng ký webhook đó bên Cal.com hiện **thủ công**: chủ tiệm tự dán URL+secret từ `webhook-secret-card.tsx` vào Cal.com.
- `lib/calcom.ts` chưa có hàm quản lý webhook nào.
- 2 chế độ xác thực song song: `cal_api_key_encrypted` (không giới hạn scope) và OAuth (`cal_auth_mode = 'oauth'`, scope cố định trong `CAL_OAUTH_SCOPES` — hiện KHÔNG có scope liên quan webhook).
- `getCalAccessTokenForWorkspace(workspaceId)` (`lib/workspace.ts`) đã là resolver thống nhất — trả về Bearer token hợp lệ bất kể mode, tự refresh nếu OAuth.

## 2. Quyết định thiết kế

| Chủ đề | Chọn |
|---|---|
| Tạo webhook | Best-effort, non-fatal — lỗi không chặn flow Connect/lưu API key |
| Áp dụng cho | Cả 2 mode (api_key + oauth) qua `getCalAccessTokenForWorkspace` — không phân biệt code path |
| Rủi ro scope OAuth | Chưa xác nhận `POST /v2/webhooks` có cần scope riêng khi gọi bằng OAuth token. Chấp nhận rủi ro, xác minh lúc code (mục 5) |
| Chống tạo trùng | Gọi `GET /v2/webhooks` kiểm tra `subscriberUrl` đã tồn tại trước khi tạo |
| **Retry khi đăng ký lỗi (đổi so với bản đầu)** | **Không để người dùng tự cấu hình.** Vì tick/reconciliation định kỳ đang bị gác lại (yêu cầu người dùng 2026-08-07), webhook là đường sync duy nhất — cần tự phục hồi mà không cần cron. Xem mục 3.4. |
| Cột mới | `workspaces.cal_webhook_synced_at timestamptz null` — set khi `ensureCalWebhookForWorkspace` thành công (tạo mới HOẶC đã tồn tại). Dùng làm cổng rẻ để không gọi lại `listWebhooks` mỗi lần nếu đã xong; NULL nghĩa là "còn cần thử lại". |
| `webhook-secret-card.tsx` | Đổi từ "hướng dẫn tự dán" sang hiển thị trạng thái (Đã tự động đăng ký / Đang chờ thử lại) — không còn là con đường bắt buộc |
| Idempotency analytics | Chuyển `trackServer` từ webhook route vào `upsertCalBookings`, dùng lại khối so sánh `prev`/`row` đã có — không thêm bảng `webhook_events` |

## 3. Kiến trúc

### 3.1 Hàm mới trong `lib/calcom.ts`

```
listWebhooks(): GET /v2/webhooks
createWebhook(input: { subscriberUrl, secret, triggers, active: true }): POST /v2/webhooks
```

Theo đúng pattern các hàm khác trong file — nhận bearer qua `withCalApiKey`, không tự đọc key.

### 3.2 Hàm điều phối — `ensureCalWebhookForWorkspace(workspaceId)`

```
1. token = await getCalAccessTokenForWorkspace(workspaceId)
2. secret = await ensureWebhookSecret(workspaceId)          // đã có, không đổi
3. subscriberUrl = `${appOrigin()}/api/cal/webhook?workspace_id=${workspaceId}`
4. withCalApiKey(token, async () => {
     existing = await listWebhooks()
     if existing có subscriberUrl trùng → return { ok: true, skipped: true }
     await createWebhook({ subscriberUrl, secret, triggers: RELEVANT_EVENTS, active: true })
   })
```

`RELEVANT_EVENTS` tái dùng đúng set đã khai trong `app/api/cal/webhook/route.ts` (`BOOKING_CREATED/RESCHEDULED/CANCELLED/REJECTED/REQUESTED/NO_SHOW`) — không định nghĩa lại.

Toàn bộ bọc try/catch, không throw ra ngoài caller.

### 3.3 Gọi ở đâu — qua `syncCalBookingsToSupabase`, không gọi trực tiếp 2 lần

`ensureCalWebhookForWorkspace` trở thành **bước đầu tiên bên trong** `syncCalBookingsToSupabase()` (`lib/sync-cal-bookings.ts`), trước đoạn `fetchAllCalBookings()` hiện có — best-effort, lỗi bị nuốt, không chặn phần sync bookings phía sau.

Lợi ích: mọi nơi đã gọi `syncCalBookingsToSupabase` tự động được thêm khả năng tự đăng ký/thử lại webhook, không cần sửa từng call site:

- `app/api/cal/oauth/callback/route.ts:82` — gọi `syncCalBookingsToSupabase(workspaceId)` một lần ngay sau khi update workspace thành công (vừa backfill booking cũ, vừa đăng ký/thử lại webhook). Theo đúng pattern best-effort đã có sẵn ở đó (`getCalMeProfileWithToken`, dòng 62-68).
- `app/dashboard/setup/actions.ts:58` (`saveCalApiKeyAction`) — cùng lệnh gọi, sau khi lưu `cal_api_key_encrypted`.
- `app/dashboard/bookings/actions.ts:37` (`syncBookingsAction`, nút "Resync" thủ công) — **không cần sửa gì** — tự động được thêm khả năng retry vì nó đã gọi `syncCalBookingsToSupabase`.
- Cần rà thêm `app/dashboard/settings/actions.ts` lúc code — nếu có đường lưu API key riêng ở Settings, hook thêm ở đó.

### 3.4 Tự phục hồi khi lần đầu thất bại

Vì `ensureCalWebhookForWorkspace` chạy lại **mỗi lần** `syncCalBookingsToSupabase` được gọi (kể cả do bấm "Resync" thủ công — hành động chủ tiệm vốn đã làm để xem booking mới, không phải cấu hình kỹ thuật), một lần đăng ký lỗi thoáng qua tự phục hồi ở lần chạy kế tiếp mà không cần cron, không cần chủ tiệm biết webhook là gì. `cal_webhook_synced_at` chặn việc gọi lại `listWebhooks` một khi đã thành công, nên chi phí giữ nguyên rẻ về sau.

Trường hợp lỗi **vĩnh viễn** (403 do thiếu scope OAuth, xem mục 5) sẽ không tự khỏi dù retry bao nhiêu lần — nếu xác nhận đúng vậy lúc code, cần báo qua `createNotification` (loại `ai_config`, đã có sẵn pattern trong `lib/notification-digests.ts`) để chủ tiệm biết "đồng bộ hai chiều với Cal.com chưa hoạt động", thay vì im lặng retry vô ích mãi.

## 4. Idempotency — analytics đếm trùng

Gap thật, đã xác minh trong code: `app/api/cal/webhook/route.ts:74-87` bắn `trackServer(BOOKING_CANCELLED_BY_GUEST/BOOKING_RESCHEDULED_BY_GUEST)` **vô điều kiện** mỗi lần webhook tới. Cal.com có thể gửi lại cùng 1 event (retry) → đếm trùng.

Phần notification tương tự trong `lib/sync-cal-bookings.ts:146-181` KHÔNG có gap này — nó so `prev` (đọc lại từ DB) với `row` mới; lần gửi lại thứ 2 thấy `prev` đã phản ánh trạng thái mới nên tự động không bắn lại.

**Sửa:** chuyển 2 lệnh `trackServer` từ `processEvent()` (webhook route) vào trong `upsertCalBookings()`, cạnh khối so sánh `wasCancelled`/reschedule đã có, dùng chung điều kiện đó.

**Giới hạn còn lại (chấp nhận được):** race thật sự đồng thời (2 request xử lý cùng lúc, cả 2 đọc `prev` trước khi 1 trong 2 kịp ghi) vẫn có thể đếm trùng — hiếm, hậu quả thấp (lệch số phân tích, không phải dữ liệu khách hàng), không đáng xây khoá/ledger riêng cho case này.

## 5. Rủi ro cần xác minh lúc implementation

`CAL_OAUTH_SCOPES` (`lib/cal-oauth.ts:7-13`) không có scope webhook. Đã tra docs Cal.com (xem Sources) — không tìm thấy xác nhận rõ `POST /v2/webhooks` có đòi thêm scope khi gọi bằng OAuth token hay không. Vì đăng ký là best-effort/non-fatal (mục 2), thiết kế này KHÔNG bị chặn bởi câu hỏi này — chỉ cần biết để không ngạc nhiên nếu tenant OAuth không tự có webhook, và đọc log để xác nhận đúng nguyên nhân (403 quyền, không phải bug).

Nếu xác nhận thiếu scope: cần thêm scope vào `CAL_OAUTH_SCOPES`, chờ Cal.com duyệt lại OAuth client, và các workspace OAuth hiện có phải Connect lại — đúng đánh đổi đã ghi trong amendment của `2026-07-29-cal-oauth-client-design.md`. Đây là lý do chính khiến amendment đó giữ paste API key sống — API key không vướng gap này.

## 6. Testing

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Connect Cal.com lần đầu (OAuth hoặc API key) | Webhook tạo tự động, không cần thao tác `webhook-secret-card` |
| 2 | Connect lại / lưu lại key | `listWebhooks` thấy `subscriberUrl` trùng → không tạo lần 2 |
| 3 | OAuth token thiếu scope tạo webhook | 403 bị bắt, log lại, flow Connect vẫn thành công |
| 4 | Cal.com gửi lại cùng `BOOKING_CANCELLED` 2 lần | Chỉ 1 notification, chỉ 1 analytics event |
| 5 | Webhook chưa đăng ký được (case 3), sau đó chủ tiệm bấm "Resync" | `syncCalBookingsToSupabase` thử lại `ensureCalWebhookForWorkspace` — nếu hết lỗi tạm thời, lần này đăng ký thành công, `cal_webhook_synced_at` được set |
| 6 | `cal_webhook_synced_at` đã set, gọi `syncCalBookingsToSupabase` lần nữa | Không gọi lại `listWebhooks` — bỏ qua bước ensure, đi thẳng vào sync bookings |

## 7. Ngoài phạm vi

- Ẩn/xoá paste API key khỏi UI — ngược lại, amendment đã quyết giữ.
- Bảng `webhook_events` ledger đầy đủ (payload, event_id) — không cần, xem mục 4.
- Thông báo chủ động qua `createNotification` khi lỗi vĩnh viễn (mục 3.4) — nêu hướng, nhưng chỉ code nếu mục 5 xác nhận đúng là lỗi scope thật; không code "phòng hờ" cho lỗi chưa xác nhận tồn tại.

---

Sources:
- [OAuth - Cal.com Docs](https://cal.com/help/apps-and-integrations/oauth)
- [Webhooks - Cal.com core features docs](https://cal.com/docs/core-features/webhooks)
- [Create a webhook - Cal.com API v2 reference](https://cal.com/docs/api-reference/v2/event-types-webhooks/create-a-webhook)
