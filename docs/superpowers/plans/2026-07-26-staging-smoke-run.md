# Chạy smoke trên preview deploy (cổng cuối) — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md). **Cổng cuối** — chạy sau mọi plan khác.

**Goal:** Chạy toàn bộ smoke checklist trên một deploy thật, lấy quyết định go / no-go dựa trên bằng chứng chứ không dựa trên cảm giác.

**Architecture:** Không có code. Đây là cổng kiểm chứng: deploy preview → chạy checklist → ghi kết quả → báo cáo.

**Tech Stack:** Vercel preview deployment, `curl`, trình duyệt.

**Vì sao cần:** `docs/SMOKE.md` đầy đủ nhưng từ trước tới nay chỉ chạy ở local. Vài đường chỉ tồn tại trên production:

| Đường | Vì sao local không kiểm chứng được |
|-------|-----------------------------------|
| cookie cross-site của embed | `SameSite=None; Secure` cần HTTPS (`proxy.ts:41-43`) |
| Vercel cron | `vercel.json` chỉ có tác dụng trên Vercel |
| deliverability của Resend | cần domain đã verify |
| `vercelOidc()` auth | `agent/channels/eve.ts:56` — nhánh này không chạy ở local |
| header `frame-ancestors` | qua CDN mới thấy đúng thứ khách thấy |

## Điều kiện tiên quyết

Không bắt đầu khi chưa xong:

- [ ] [smoke-refresh](2026-07-26-smoke-refresh.md) — **bắt buộc**, nếu không sẽ chạy một checklist sai
- [ ] [production-env](2026-07-26-production-env.md) — **bắt buộc**, cung cấp checklist env + 5 lệnh curl
- [ ] [legal-pages](2026-07-26-legal-pages.md), [signup-gate](2026-07-26-signup-gate.md), [durable-rate-limit](2026-07-26-durable-rate-limit.md) — bắt buộc để release
- [ ] [seo-robots](2026-07-26-seo-robots.md), [cal-key-tool-errors](2026-07-26-cal-key-tool-errors.md), [error-monitoring](2026-07-26-error-monitoring.md), [migration-rollback](2026-07-26-migration-rollback.md) — nếu bỏ, ghi rõ là bỏ có chủ đích

## Global Constraints

- **Deploy preview, không phải production.** Đưa lên production là quyết định riêng của user sau khi xem báo cáo.
- Trích `docs/SMOKE.md` **theo tên section**, không theo số — smoke-refresh đã đánh số lại.
- Mục nào fail thì **ghi lại và đi tiếp**. Chạy hết rồi báo cáo một lượt; đừng dừng ở lỗi đầu tiên rồi bỏ ngỏ phần còn lại.
- Không tự sửa code khi đang chạy cổng này. Phát hiện lỗi → ghi lại, để user quyết định.

---

### Task 1: Deploy preview + kiểm chứng hạ tầng

**Files:** không sửa file.

**Interfaces:**
- Consumes: `docs/ops/production-env.md` từ [production-env](2026-07-26-production-env.md)
- Produces: một URL preview đang chạy, đã qua 5 lệnh curl.

- [ ] **Bước 1: Deploy nhánh release lên preview**

Dùng skill `deploy-vercel` (quirk env/build riêng của repo này) cùng với `deploy-to-vercel` (cơ chế CLI). Deploy dạng **preview**.

Ghi lại URL preview — mọi bước sau dùng nó.

- [ ] **Bước 2: Đối chiếu env**

Chạy hết bảng "Bắt buộc" trong `docs/ops/production-env.md` với project preview. Thiếu biến nào → **dừng, báo user**. Chạy smoke với env thiếu chỉ tạo ra tiếng ồn.

- [ ] **Bước 3: Chạy 5 lệnh curl**

Đúng như trong `docs/ops/production-env.md` section "Kiểm chứng sau deploy", thay `YOUR_DOMAIN` bằng host preview:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://PREVIEW_HOST/api/cron/tick
curl -s -H "Authorization: Bearer $CRON_SECRET" https://PREVIEW_HOST/api/cron/tick
curl -sI https://PREVIEW_HOST/ | grep -i -E "x-frame-options|content-security-policy"
curl -sI https://PREVIEW_HOST/embed/eve-pilot | grep -i content-security-policy
curl -s https://PREVIEW_HOST/robots.txt
```

Mong đợi lần lượt: `401`; JSON `{"ok":true,…}`; `DENY` + `frame-ancestors 'none'`; `frame-ancestors *`; có `Disallow: /dashboard/`.

Ghi lại output thật của từng lệnh — đây là bằng chứng cho báo cáo.

- [ ] **Bước 4: Kiểm tra trang pháp lý lên được**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://PREVIEW_HOST/terms
curl -s -o /dev/null -w "%{http_code}\n" https://PREVIEW_HOST/privacy
```

Mong đợi: `200` cả hai.

---

### Task 2: Chạy các đường chức năng

**Files:** không sửa file.

**Interfaces:**
- Consumes: `docs/SMOKE.md` sau [smoke-refresh](2026-07-26-smoke-refresh.md)
- Produces: kết quả pass/fail từng section.

- [ ] **Bước 1: Tenant happy path**

`docs/SMOKE.md` → section "Tenant happy path (ordered)", chạy hết, với **một lần đăng ký mới** trên URL preview. Không dùng `/chat`, không dùng localhost.

Chú ý riêng hai mục về tách `setup_completed_at` / `bookingLive` — chúng mới có và chưa từng chạy trên deploy thật.

- [ ] **Bước 2: Huỷ / đổi lịch phía khách**

`docs/SMOKE.md` → section "Cancel / reschedule via chat", chạy hết. Mục OTP email cần `RESEND_API_KEY` + domain đã verify (`docs/ops/resend-domain-setup.md`). Chưa có domain → đánh dấu SKIPPED kèm lý do, không đánh dấu PASS.

- [ ] **Bước 3: Mời nhân viên**

`docs/SMOKE.md` → section "Invite staff", chạy hết. Đây là phần đổi nhiều nhất gần đây (email bắt buộc, gỡ thành viên, chuyển owner) và là lần đầu email invite đi qua Resend thật.

- [ ] **Bước 4: Embed trên domain bên thứ ba thật**

`docs/SMOKE.md` → section "Embed widget". Lấy snippet từ `/dashboard/embed` trên preview, dán vào một trang HTTPS **khác domain** (CodePen, hoặc một file tĩnh trên domain khác).

Đây là bước duy nhất không thể thay thế bằng bất cứ thứ gì ở local — cookie cross-site chỉ hoạt động thật ở đây. Xem `docs/superpowers/embed-cookie-limits.md` để biết cái gì được kỳ vọng hỏng.

- [ ] **Bước 5: Cổng đăng ký**

Với `EVE_SIGNUP_MODE` mà user chọn cho lúc ra mắt:

- `open` → `/signup` hiện form, đăng ký được
- `invite_only` → `/signup` redirect `/login`, nhưng `/invite/{token}` vẫn tạo tài khoản được

Kiểm chứng đúng chế độ sẽ dùng khi ra mắt, không phải chế độ tiện thử.

- [ ] **Bước 6: Giới hạn lượt agent**

`docs/SMOKE.md` → section "Agent rate limit". Trần production là 30 lượt/giờ — quá tốn để chạm tay. Thay vào đó xác nhận cơ chế đang chạy:

```bash
# sau vài lượt chat trên preview
```

Kiểm tra bảng `agent_rate_limits` trên Supabase project của preview có bucket `v:` và `w:`. Có row = đường đi Postgres đang hoạt động trên serverless, đó là điều cần chứng minh.

- [ ] **Bước 7: Các trang dashboard**

Mở hết danh sách trong `docs/SMOKE.md` section "Auth / profiles". Trang nào 404/500 → ghi lại.

---

### Task 3: Chờ một chu kỳ cron rồi báo cáo

**Files:**
- Modify: `docs/SMOKE.md` (ghi kết quả lần chạy)

**Interfaces:**
- Consumes: kết quả Task 1 + Task 2
- Produces: quyết định go / no-go cho user.

- [ ] **Bước 1: Chờ cron chạy**

Vercel → Crons. Xác nhận `/api/cron/tick` chạy và trả 200 trong vòng 15 phút (lịch `*/15 * * * *`).

Xác nhận thêm: một workspace đã bật nhắc lịch, có booking sắp tới → sinh được row reminder.

- [ ] **Bước 2: Kiểm tra log không có lỗi bất ngờ**

Vercel → Logs, lọc `[cron/tick]` và `[agent-rate-limit]`. Lỗi lạ → ghi vào báo cáo.

Nếu [error-monitoring](2026-07-26-error-monitoring.md) đã land với Sentry, kiểm tra dashboard Sentry cho khoảng thời gian smoke.

- [ ] **Bước 3: Ghi kết quả vào SMOKE.md**

Ngay dưới tiêu đề file:

```markdown
> Lần chạy đầy đủ gần nhất: 2026-__-__ trên preview `<url>` — kết quả: PASS / FAIL (ghi chú)
```

- [ ] **Bước 4: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: record staging smoke run result"
```

- [ ] **Bước 5: Báo cáo user**

Trình bày:

1. **Section nào PASS** — kèm bằng chứng (output curl, ảnh chụp nếu có)
2. **Section nào FAIL** — mục nào, quan sát được gì, đoán mức nghiêm trọng
3. **Section nào SKIPPED** — và vì sao (thiếu domain Resend, v.v.)
4. **Khuyến nghị go / no-go**

**Không promote lên production khi chưa có phê duyệt rõ ràng của user.** Deploy production là hành động một chiều, hướng ra ngoài — nó là quyết định của họ, không phải của bạn.

---

## Self-review trước khi đóng plan

- [ ] Mọi section trong `docs/SMOKE.md` đều được đánh PASS / FAIL / SKIPPED — không mục nào bỏ trống
- [ ] Mục SKIPPED có lý do, không phải "chưa kịp làm"
- [ ] Bước embed chạy trên domain khác thật, không phải localhost hay chính domain preview
- [ ] Chưa promote lên production
