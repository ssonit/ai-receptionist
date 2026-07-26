# Giám sát lỗi server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md).

**Goal:** Biết được khi có lỗi server, thay vì chờ người dùng báo.

**Architecture:** Task 1 (tài liệu hoá nơi lỗi hiện ra hôm nay) làm **vô điều kiện** — nó rẻ và luôn đúng. Task 2 chỉ làm nếu user chọn Sentry.

**Tech Stack:** Vercel runtime logs; tuỳ chọn `@sentry/nextjs`.

**Vì sao cần:** không có Sentry, không có log drain. PostHog (`lib/analytics-client.ts`) là product analytics — nó **không** nhận exception. Hôm nay một lỗi 500 trong server action hay trong `/api/cron/tick` là vô hình trừ khi có người mở Vercel function logs.

## Chặn ở đâu

**Cần user chọn trước khi bắt đầu Task 2:**

| Phương án | Đánh đổi |
|-----------|----------|
| (a) `@sentry/nextjs` | Có stack trace, có gom nhóm, có cảnh báo. Thêm dependency, thêm bước build, cần tài khoản |
| (b) Vercel log drain sang công cụ sẵn có | Không đụng code. Cần đã có nơi nhận log |
| (c) Chấp nhận Vercel runtime logs cho v1 | Không tốn gì. Không cảnh báo — phải chủ động vào xem |

**(c) là câu trả lời hợp lệ cho v1.** Chọn (c) thì làm Task 1 rồi đóng plan.

## Global Constraints

- Không có test runner — kiểm chứng bằng cách gây lỗi thật rồi xem nó có hiện ra không.
- `next.config.ts:37` export `withEve(nextConfig)`. Mọi wrapper thêm vào phải bọc **bên ngoài** `withEve`, không thay nó.
- Sau khi sửa code: `graphify update .`.

---

### Task 1: Tài liệu hoá nơi lỗi hiện ra hôm nay (làm dù chọn phương án nào)

**Files:**
- Modify: `docs/SMOKE.md` — thêm section `## Ops — nơi lỗi hiện ra`

**Interfaces:**
- Consumes: các tiền tố log đã có trong code
- Produces: một chỗ để người trực sự cố biết mở cái gì.

- [ ] **Bước 1: Thu thập các tiền tố log thật trong code**

```bash
grep -rn "console.error(\"\[" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Ghi lại các tiền tố tìm được (ít nhất có `[cron/tick]`; thêm `[agent-rate-limit]` nếu [durable-rate-limit](2026-07-26-durable-rate-limit.md) đã land). Chỉ liệt kê tiền tố **thật sự tồn tại**.

- [ ] **Bước 2: Thêm section vào SMOKE.md**

```markdown
## Ops — nơi lỗi hiện ra

- **Lỗi runtime server:** Vercel → Project → Logs. Lọc theo tiền tố: `[cron/tick]`, `[agent-rate-limit]`.
- **Cron fail:** hiện thành non-200 của `/api/cron/tick` ở Vercel → Crons.
- **Lỗi build:** Vercel → Deployments → deploy tương ứng.
- **PostHog chỉ nhận event sản phẩm, không bao giờ nhận exception.** Đừng tìm lỗi ở đó.
- Lỗi phía client trong chat: DevTools console của khách — hiện **không** thu thập tập trung.
```

Dòng cuối ghi thẳng giới hạn hiện tại. Người trực sự cố cần biết chỗ nào là điểm mù.

- [ ] **Bước 3: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs(ops): document where server errors surface today"
```

- [ ] **Bước 4: Hỏi user chọn phương án**

Trình bày ba phương án ở đầu file này. Chọn (b) hoặc (c) → dừng plan tại đây và ghi lại lựa chọn. Chọn (a) → sang Task 2.

---

### Task 2: Cài Sentry (chỉ khi user chọn phương án a)

**Files:**
- Create: `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`, `instrumentation.ts` (wizard sinh ra)
- Modify: `next.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- Produces: không export ở tầng app — lỗi tự động tới dashboard.

- [ ] **Bước 1: Ghi lại `next.config.ts` trước khi chạy wizard**

```bash
cat next.config.ts
```

Lưu lại nội dung. Wizard sẽ sửa file này và bạn cần so sánh — cấu hình hiện tại có khối `headers()` cho `frame-ancestors` (dòng 9-34) **bắt buộc phải sống sót**.

- [ ] **Bước 2: Chạy wizard**

```bash
npx @sentry/wizard@latest -i nextjs
```

- [ ] **Bước 3: Rà diff `next.config.ts` cực kỹ**

Hai thứ phải đúng:

1. Khối `headers()` còn nguyên. Mất nó là `/embed/*` hết nhúng được và trang thường hết được bảo vệ khỏi clickjacking.
2. Thứ tự wrapper: `withSentryConfig` bọc **bên ngoài** `withEve`:

```ts
export default withSentryConfig(withEve(nextConfig), {
  // sentry options
});
```

Wizard không biết `withEve`. Nếu nó thay hoặc bọc sai thứ tự, sửa tay.

```bash
git diff next.config.ts
```

- [ ] **Bước 4: Chặn init khi thiếu DSN**

Trong `sentry.server.config.ts` và `sentry.client.config.ts`, bọc `Sentry.init` lại:

```ts
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
}
```

Không có bước này, dev local sẽ ồn và có thể gửi nhiễu lên project thật.

- [ ] **Bước 5: Tài liệu hoá env**

Thêm vào `.env.example`:

```
# ── Error monitoring (Sentry) ──────────────────────────────────────────────
# Thiếu DSN = no-op; app vẫn chạy.
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

Thêm một dòng vào bảng "Nên có" trong `docs/ops/production-env.md` (nếu [production-env](2026-07-26-production-env.md) đã land).

- [ ] **Bước 6: Kiểm chứng build vẫn xanh**

```bash
npm run typecheck
npm run build
```

Mong đợi: build xong. Đây là bước quan trọng nhất của task — `withSentryConfig` sai thứ tự thường vỡ ngay tại đây.

- [ ] **Bước 7: Kiểm chứng header còn sống sau khi build**

```bash
npm run start
```

```bash
curl -sI http://localhost:3000/ | grep -i -E "x-frame-options|content-security-policy"
curl -sI http://localhost:3000/embed/eve-pilot | grep -i content-security-policy
```

Mong đợi: `frame-ancestors 'none'` + `X-Frame-Options: DENY` cho trang thường; `frame-ancestors *` cho embed. Khác đi nghĩa là wizard đã nuốt mất `headers()`.

- [ ] **Bước 8: Kiểm chứng lỗi thật sự tới nơi**

Tạo tạm `app/debug-sentry/page.tsx`:

```tsx
export default function DebugSentryPage() {
  throw new Error("Sentry smoke test — safe to ignore");
}
```

Đặt `NEXT_PUBLIC_SENTRY_DSN` trong `.env.local`, chạy `npm run dev`, mở `http://localhost:3000/debug-sentry`. Mong đợi: lỗi hiện trong dashboard Sentry trong ~1 phút.

- [ ] **Bước 9: Xoá route thử**

```bash
rm -rf app/debug-sentry
git status --short
```

Mong đợi: `app/debug-sentry` không còn trong cây làm việc. **Đừng commit nó.**

- [ ] **Bước 10: Cập nhật section Ops trong SMOKE.md**

Sửa dòng đầu của section thêm ở Task 1:

```markdown
- **Lỗi runtime server:** Sentry (gom nhóm + cảnh báo) là nơi xem chính; Vercel → Project → Logs cho raw. Lọc theo tiền tố: `[cron/tick]`, `[agent-rate-limit]`.
```

- [ ] **Bước 11: graph + commit**

```bash
graphify update .
git add .
git commit -m "feat(ops): add Sentry error monitoring"
```

---

## Self-review trước khi đóng plan

- [ ] Task 1 đã xong bất kể user chọn gì
- [ ] (nếu làm Task 2) khối `headers()` trong `next.config.ts` còn nguyên và đã kiểm chứng bằng curl **sau build**
- [ ] (nếu làm Task 2) `withSentryConfig(withEve(nextConfig), …)` — đúng thứ tự
- [ ] (nếu làm Task 2) `app/debug-sentry` đã bị xoá
- [ ] Lựa chọn của user được ghi lại ở đâu đó lâu dài, không chỉ trong hội thoại
