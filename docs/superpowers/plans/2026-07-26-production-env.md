# Checklist env production + kiểm chứng sau deploy — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md). Chạy **trước** [staging-smoke-run](2026-07-26-staging-smoke-run.md).

**Goal:** Có một runbook nói rõ biến env nào bắt buộc, thiếu thì hỏng cái gì, và năm lệnh `curl` chứng minh deploy đứng đúng.

**Architecture:** Chỉ tài liệu. Giá trị của nó nằm ở việc ghi lại các **fallback âm thầm** — vài secret trong app này có đường lui, nên thiếu chúng không làm app crash lúc khởi động; nó hỏng lặng lẽ.

**Tech Stack:** Markdown + `curl`.

## Global Constraints

- Không sửa code. Phát hiện code sai thì ghi lại và báo user.
- Nguồn danh sách biến là `.env.example` — nếu lệch, `.env.example` thắng và phải sửa runbook.
- Mọi khẳng định "thiếu cái này thì hỏng X" phải trỏ được về một dòng code cụ thể. Không đoán.

## Các fallback âm thầm đã xác minh

| Biến | Fallback | Hậu quả |
|------|----------|---------|
| `WORKSPACE_SECRETS_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (`lib/workspace-secrets.ts`) | xoay service-role key làm mọi Cal key đã lưu không giải mã được |
| `BOOKING_MANAGE_CODE_PEPPER` | `WORKSPACE_SECRETS_KEY` (`.env.example`) | cùng bẫy xoay khoá |
| `CRON_SECRET` | không có — `authorize()` trả `false` cho **mọi** request (`app/api/cron/tick/route.ts:10-14`) | reminder và Cal sync dừng lặng lẽ, không báo lỗi |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | không có — `proxy.ts:49-51` return sớm | **bỏ qua toàn bộ kiểm tra auth ở proxy**; route dashboard hết redirect |
| `NEXT_PUBLIC_POSTHOG_KEY` | không có — no-op có chủ đích | analytics im lặng |
| `RESEND_API_KEY` | không có — OTP rơi về "nhờ nhân viên" | không email mời, không email nhắc lịch |

---

### Task 1: Viết runbook

**Files:**
- Create: `docs/ops/production-env.md`

**Interfaces:**
- Consumes: `.env.example`, `app/api/cron/tick/route.ts:9-14`, `proxy.ts:47-51`, `vercel.json`
- Produces: checklist chạy được cho [staging-smoke-run](2026-07-26-staging-smoke-run.md) bước 2.

- [ ] **Bước 1: Xác minh lại từng khẳng định trong bảng trên**

```bash
grep -n "CRON_SECRET" app/api/cron/tick/route.ts
grep -n "NEXT_PUBLIC_SUPABASE_URL" proxy.ts
grep -rn "WORKSPACE_SECRETS_KEY" lib/
```

Chỉ viết vào runbook những dòng bạn tự xác nhận được. Khẳng định nào không khớp code → sửa lại lời văn, code thắng.

- [ ] **Bước 2: Tạo file**

Tạo `docs/ops/production-env.md`:

```markdown
# Production env checklist

Chạy trước lần deploy công khai đầu tiên và sau mỗi lần xoay khoá.
Nguồn danh sách đầy đủ: [`.env.example`](../../.env.example).

## Bắt buộc (thiếu là hỏng hoặc mất an toàn)

| Biến | Vì sao quan trọng | Hỏng thế nào nếu thiếu |
|------|-------------------|------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | auth cho client + proxy | `proxy.ts:49` return sớm → **bỏ qua toàn bộ kiểm tra auth**, route dashboard hết redirect |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client cho cron, agent tools | cron tick và ghi dữ liệu từ tool đều fail |
| `WORKSPACE_SECRETS_KEY` | mã hoá Cal key theo workspace | **fallback về service-role key** — đặt tường minh để xoay khoá này không làm mồ côi khoá kia |
| `BOOKING_MANAGE_CODE_PEPPER` | hash mã quản lý của khách | fallback về `WORKSPACE_SECRETS_KEY`; cùng bẫy xoay khoá |
| `CRON_SECRET` | xác thực `/api/cron/tick` | `authorize()` trả false cho **mọi** request → nhắc lịch và Cal sync dừng lặng lẽ |
| Ít nhất một trong `DEEPSEEK_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `ANTHROPIC_API_KEY` | lượt chat của agent | chat không trả lời được |

## Nên có

| Biến | Hậu quả nếu thiếu |
|------|-------------------|
| `RESEND_API_KEY` + `EVE_MAIL_FROM` | không email mời, không email nhắc lịch, OTP khách rơi về "nhờ nhân viên" |
| `NEXT_PUBLIC_POSTHOG_KEY` | analytics no-op lặng lẽ |
| `EVE_SIGNUP_MODE` | mặc định `open` — ai có URL cũng tạo được workspace |

## Tuyệt đối KHÔNG đặt cho tenant thật

- `CALCOM_API_KEY` — đây là khoá **sandbox của Eve Pilot demo**. Tenant thật dùng khoá riêng đã mã hoá theo workspace. Nếu một tenant production đặt lịch được trong khi họ **không** có khoá riêng, tenant isolation đã vỡ.

## Ghi chú xoay khoá

Xoay `WORKSPACE_SECRETS_KEY` làm mọi `workspaces.cal_api_key_encrypted` không giải mã được. Hiện **không có script mã hoá lại** — mọi tenant sẽ phải nhập lại Cal key qua wizard setup. Coi khoá này là vĩnh viễn.

## Kiểm chứng sau deploy

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

# 4. Trang embed cho phép nhúng
curl -sI https://YOUR_DOMAIN/embed/eve-pilot | grep -i content-security-policy
# mong đợi: frame-ancestors *

# 5. robots.txt được phục vụ
curl -s https://YOUR_DOMAIN/robots.txt
# mong đợi: Disallow: /dashboard/
```

Sau đó kiểm tra Vercel → Crons: `/api/cron/tick` có lần chạy thành công trong vòng 15 phút (lịch `*/15 * * * *`, xem [`vercel.json`](../../vercel.json)). Lưu ý gói Hobby giới hạn tần suất cron — xác nhận gói của project chạy được lịch 15 phút, không thì nới ra.
```

- [ ] **Bước 3: Đối chiếu runbook với `.env.example`**

```bash
grep -E "^[A-Z_]+=" .env.example
```

Mọi biến trong output phải hoặc nằm trong runbook, hoặc rõ ràng là chỉ dùng cho local (`BOOKING_SYNC_*`, `BOOKING_NAME`, …). Thiếu biến nào → bổ sung.

- [ ] **Bước 4: Liên kết từ SMOKE.md**

Trong `docs/SMOKE.md`, ngay dưới heading `## Outbound reminders (cron)`, thêm dòng đầu:

```markdown
> Env production + kiểm chứng curl sau deploy: [`ops/production-env.md`](./ops/production-env.md)
```

- [ ] **Bước 5: Commit**

```bash
git add docs/ops/production-env.md docs/SMOKE.md
git commit -m "docs(ops): add production env and post-deploy verification checklist"
```

---

### Task 2: Đối chiếu với project Vercel thật

**Files:** không sửa file — đây là task vận hành.

**Interfaces:**
- Consumes: runbook từ Task 1
- Produces: danh sách biến còn thiếu, báo cho user.

- [ ] **Bước 1: Mở trang Environment Variables của project**

Đối chiếu từng dòng trong bảng "Bắt buộc". **Không tự bịa giá trị** — báo cho user biến nào thiếu và để họ điền.

- [ ] **Bước 2: Kiểm tra riêng `CALCOM_API_KEY`**

Nếu nó có mặt trong env production, xác nhận với user rằng nó trỏ tới lịch **sandbox** cho Eve Pilot, không phải lịch thật của tenant nào. Đây là ranh giới tenant isolation trong `.claude/rules/tenant-isolation.md`.

- [ ] **Bước 3: Xác nhận gói Vercel chạy được cron 15 phút**

Nếu không, đề xuất user nới `vercel.json` (ví dụ `0 * * * *`) và ghi lại rằng nhắc lịch sẽ kém chính xác hơn.

- [ ] **Bước 4: Báo cáo**

Liệt kê cho user: biến đã đặt, biến còn thiếu, và mọi điểm không khớp. Không tiếp tục sang [staging-smoke-run](2026-07-26-staging-smoke-run.md) cho tới khi nhóm "Bắt buộc" đủ.

---

## Self-review trước khi đóng plan

- [ ] Mọi dòng trong cột "Hỏng thế nào" đều trỏ được về một dòng code đã tự kiểm chứng
- [ ] Năm lệnh curl chạy được nguyên văn (chỉ thay `YOUR_DOMAIN`)
- [ ] Runbook có nhắc `EVE_SIGNUP_MODE` nếu [signup-gate](2026-07-26-signup-gate.md) đã land
- [ ] Cảnh báo xoay `WORKSPACE_SECRETS_KEY` viết đủ mạnh — đây là thao tác không thể hoàn tác
