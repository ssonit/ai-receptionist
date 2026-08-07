# Cal.com webhook tự động đăng ký + idempotency

**Date:** 2026-08-07  
**Status:** Design approved in conversation — chờ review file spec trước khi viết plan  
**Scope:** Tự động tạo webhook Cal.com lúc workspace connect (API key hoặc OAuth), thay cho việc chủ tiệm tự dán URL+secret. Sửa 1 gap idempotency thật (analytics đếm trùng khi Cal.com gửi lại webhook).  
**Phụ thuộc:** Độc lập với `2026-08-07-booking-reminders-event-driven-design.md` — không chặn nhau, ship theo thứ tự bất kỳ. Liên quan trực tiếp tới amendment 2026-08-07 trong `2026-07-29-cal-oauth-client-design.md` (giữ paste API key sống).

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
| Chống tạo trùng | Gọi `GET /v2/webhooks` kiểm tra `subscriberUrl` đã tồn tại trước khi tạo — không lưu cờ "đã đăng ký" trong DB, tránh lệch nếu webhook bị xoá bên Cal.com |
| Fallback thủ công | `webhook-secret-card.tsx` giữ nguyên, không ẩn |
| Retry nếu đăng ký lỗi thoáng qua | Không xây cơ chế riêng — reconciliation hourly (doc reminders) đã chặn hậu quả (dữ liệu chậm tối đa 1h) |
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

### 3.3 Gọi ở đâu

- `app/api/cal/oauth/callback/route.ts:82`, ngay sau khi update workspace thành công — theo đúng pattern best-effort đã có sẵn ở đó (`getCalMeProfileWithToken`, dòng 62-68, comment "Profile fetch is best-effort — tokens are already persisted").
- `app/dashboard/setup/actions.ts:58` (`saveCalApiKeyAction`), sau khi lưu `cal_api_key_encrypted`.
- Cần rà thêm `app/dashboard/settings/actions.ts` lúc code — nếu có đường lưu API key riêng ở Settings (ngoài setup wizard), hook thêm ở đó.

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
| 5 | Webhook chưa đăng ký được (case 3) | Reconciliation hourly (doc reminders) vẫn đưa booking về trong ≤1h |

## 7. Ngoài phạm vi

- Ẩn/xoá paste API key khỏi UI — ngược lại, amendment đã quyết giữ.
- Bảng `webhook_events` ledger đầy đủ (payload, event_id) — không cần, xem mục 4.
- Retry tự động nếu đăng ký lỗi lúc connect — xem mục 2.

---

Sources:
- [OAuth - Cal.com Docs](https://cal.com/help/apps-and-integrations/oauth)
- [Webhooks - Cal.com core features docs](https://cal.com/docs/core-features/webhooks)
- [Create a webhook - Cal.com API v2 reference](https://cal.com/docs/api-reference/v2/event-types-webhooks/create-a-webhook)
