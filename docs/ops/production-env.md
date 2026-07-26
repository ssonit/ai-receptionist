# Production env checklist

Chạy trước lần deploy công khai đầu tiên và sau mỗi lần xoay khoá.
Nguồn danh sách đầy đủ: [`.env.example`](../../.env.example).

Đối chiếu với code ngày 2026-07-26 (`main`). Mọi dòng “hỏng thế nào” trỏ về file đã kiểm chứng.

## Bắt buộc (thiếu là hỏng hoặc mất an toàn)

| Biến | Vì sao quan trọng | Hỏng thế nào nếu thiếu |
|------|-------------------|------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | auth cho client + proxy | [`proxy.ts:49-52`](../../proxy.ts) return sớm → **bỏ qua toàn bộ kiểm tra auth**, route dashboard hết redirect |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client cho cron, agent tools | [`lib/supabase/admin.ts`](../../lib/supabase/admin.ts) throw nếu thiếu → cron tick và ghi dữ liệu từ tool đều fail |
| `WORKSPACE_SECRETS_KEY` | mã hoá Cal key theo workspace | [`lib/workspace-secrets.ts:9-12`](../../lib/workspace-secrets.ts) **fallback về `SUPABASE_SERVICE_ROLE_KEY`** (rồi chuỗi dev cố định) — đặt tường minh để xoay service-role không làm mồ côi Cal key đã lưu |
| `BOOKING_MANAGE_CODE_PEPPER` | hash mã quản lý của khách | [`lib/booking-manage-code.ts:12-13`](../../lib/booking-manage-code.ts) fallback về `WORKSPACE_SECRETS_KEY`; cùng bẫy xoay khoá |
| `CRON_SECRET` | xác thực `/api/cron/tick` | [`app/api/cron/tick/route.ts:9-13`](../../app/api/cron/tick/route.ts) — thiếu secret → `authorize()` trả `false` cho **mọi** request → nhắc lịch và Cal sync dừng lặng lẽ (401) |
| Ít nhất một trong `DEEPSEEK_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `ANTHROPIC_API_KEY` | lượt chat của agent | chat không trả lời được |

## Nên có

| Biến | Hậu quả nếu thiếu |
|------|-------------------|
| `RESEND_API_KEY` + `EVE_MAIL_FROM` | không email mời, không email nhắc lịch, OTP khách rơi về “nhờ nhân viên” |
| `NEXT_PUBLIC_POSTHOG_KEY` (+ optional `NEXT_PUBLIC_POSTHOG_HOST`) | analytics no-op lặng lẽ |
| `EVE_SIGNUP_MODE` | mặc định `open` — ai có URL cũng tạo được workspace; đặt `invite_only` để đóng `/signup` công khai ([`lib/signup-mode.ts`](../../lib/signup-mode.ts)) |
| `AGENT_DEFAULT_MODEL` | mặc định theo code nếu thiếu; nên set tường minh trên prod |

## Chỉ Pilot / local (không thay thế khoá tenant)

Các biến dưới đây có trong `.env.example` cho demo Eve Pilot và sync local — **không** dùng làm cấu hình Cal của tenant production:

- `CALCOM_API_KEY`, `CALCOM_API_BASE_URL`, `CALCOM_EVENT_TYPE_ID`, `CALCOM_EVENT_TYPE_SLUG`, `CALCOM_USERNAME`
- `BOOKING_WORKSPACE_ID`, `NEXT_PUBLIC_BOOKING_WORKSPACE_ID`, `BOOKING_NAME`, `BOOKING_TIMEZONE`, `BOOKING_MIN_NOTICE_HOURS`
- `BOOKING_SYNC_PAGE_LIMIT`, `BOOKING_SYNC_MAX_PAGES`, `BOOKING_SYNC_STORE_RAW`

## Tuyệt đối KHÔNG đặt nhầm cho tenant thật

- `CALCOM_API_KEY` trên production chỉ được trỏ tới lịch **sandbox Eve Pilot**. Tenant thật dùng khoá riêng đã mã hoá theo workspace (`cal_api_key_encrypted`). Nếu một tenant production đặt lịch được trong khi họ **không** có khoá riêng, tenant isolation đã vỡ (xem `.cursor/rules/tenant-isolation.mdc`).

## Ghi chú xoay khoá

Xoay `WORKSPACE_SECRETS_KEY` làm mọi `workspaces.cal_api_key_encrypted` không giải mã được. Hiện **không có script mã hoá lại** — mọi tenant sẽ phải nhập lại Cal key qua wizard setup. Coi khoá này là vĩnh viễn trừ khi chấp nhận downtime + re-entry Cal cho toàn bộ workspace.

## Kiểm chứng sau deploy

Thay `YOUR_DOMAIN` bằng host production / preview.

```bash
# 1. Cron từ chối người gọi không xác thực
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR_DOMAIN/api/cron/tick
# mong đợi: 401

# 2. Cron chạy được với secret
curl -s -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/tick
# mong đợi: {"ok":true,"workspaces":N,...}

# 3. Trang thường từ chối bị nhúng iframe
curl -sI https://YOUR_DOMAIN/ | grep -i -E "x-frame-options|content-security-policy"
# mong đợi: X-Frame-Options: DENY và frame-ancestors 'none'
# (cấu hình: next.config.ts headers; xác nhận trên preview/`next start`, không chỉ `next dev`)

# 4. Trang embed cho phép nhúng
curl -sI https://YOUR_DOMAIN/embed/eve-pilot | grep -i content-security-policy
# mong đợi: frame-ancestors *

# 5. robots.txt được phục vụ (sau khi plan seo-robots land)
curl -s https://YOUR_DOMAIN/robots.txt
# mong đợi: Disallow: /dashboard/ (và các path nhạy cảm khác)
```

Sau đó kiểm tra Vercel → Crons: `/api/cron/tick` có lần chạy thành công trong vòng 15 phút (lịch `*/15 * * * *`, xem [`vercel.json`](../../vercel.json)). Gói Hobby có giới hạn tần suất cron — xác nhận gói của project chạy được lịch 15 phút; không thì nới ra (ví dụ `0 * * * *`) và chấp nhận nhắc lịch kém chính xác hơn.
