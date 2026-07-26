# Release Readiness — Index

> **Đây là index, không phải plan thực thi.** Mỗi việc có file plan riêng bên dưới. Đọc file này để biết thứ tự và cái nào chặn cái nào, rồi mở đúng plan cần làm.

**Goal:** Đóng các khoảng trống phi-tính-năng giữa `main` hiện tại và bản release công khai đầu tiên của eve-booking.

**Ngày lập:** 2026-07-26.

---

## Cách làm việc trong nhóm plan này

**Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy.

Agent nào chạy `superpowers:executing-plans` hoặc `superpowers:subagent-driven-development`: **bỏ qua bước `using-git-worktrees`** của chúng. Skill đó chặn vì luật *"never start implementation on main without explicit consent"* — đây chính là sự đồng ý rõ ràng đó, đã ghi lại.

Đổi lại: **commit từng task một**, message rõ ràng. Commit nhỏ là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.

---

## Global Constraints (áp dụng cho mọi plan trong nhóm này)

Mỗi plan con lặp lại phần liên quan của nó, nhưng đây là bản đầy đủ:

- **Sửa thẳng `main`, không branch, không worktree** — xem mục trên.
- **Không có test runner trong repo** (không vitest/jest/playwright trong `package.json`). "Test" trong mọi plan = một lệnh cụ thể kèm output mong đợi, hoặc một bước thủ công có tên trong `docs/SMOKE.md`. **Không được bịa ra `npm test`.**
- **`docs/SMOKE.md` đã viết lại khớp code** (2026-07-26) nhưng **chưa lần nào chạy hết** — bảng "Nhật ký chạy" trong đó đang rỗng. Trích SMOKE **theo tên section**, không theo số thứ tự.
- **Sửa code trong luồng SMOKE.md bao phủ thì sửa SMOKE.md cùng commit.** Bảng ánh xạ code-path → section ở mục "Bảo trì" cuối file đó; ràng buộc là mục 11 trong `AGENTS.md`.
- **Lỗi hiển thị cho user:** code trong `lib/errors/app-codes.ts`, copy trong `lib/errors/app-messages.ts` (record **tiếng Anh**). Không trả chuỗi thô của provider/DB ra UI (`.claude/rules/errors.md`).
- **Tenant isolation:** mọi truy vấn mới `.eq("workspace_id", workspaceId)`. Không `using (true)` RLS trên bảng tenant (`.claude/rules/tenant-isolation.md`).
- **Chuỗi UI sản phẩm** qua `messages/en.json` + `messages/vi.json` (namespace: `chat`, `dashboard`, `common`). Landing page (`app/_components/landing-page.tsx`) hiện hardcode tiếng Anh — giữ nguyên style đó, **không** i18n hoá trong nhóm plan này.
- **Sau khi sửa React/UI:** `npm run doctor`, sửa hết error rồi mới commit (`.claude/rules/react-doctor.md`).
- **Sau khi sửa code:** `graphify update .` (`.claude/rules/graphify.md`).
- **Migration:** file mới, timestamp sort sau `20260726000001`. Không sửa migration đã tồn tại. Không đụng `20260724000001_init_schema.sql`.
- **Commit style** theo lịch sử repo: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore: …`. **Mỗi task một commit.**
- **Sửa hàng loạt file docs bằng script:** không dùng `Get-Content -Raw` + `Out-File` (PowerShell 5.1 đọc UTF-8 bằng codepage ANSI → mojibake toàn bộ tiếng Việt, im lặng). Dùng `[System.IO.File]::ReadAllText/WriteAllText` với `UTF8Encoding($false)`, rồi đếm `[ÃÂ]|â€` để xác minh.

---

## Task 0 — Baseline gate (làm trước mọi plan)

Nhỏ, không có file plan riêng. Làm ngay tại đây.

- [ ] **Bước 1: Kiểm tra cây làm việc**

```bash
git status --short
```

Có file nguồn lạ đang bẩn → **dừng, hỏi user**, đừng commit việc không phải của mình.

- [ ] **Bước 2: Commit graph đã sinh lại**

```bash
git add graphify-out/ && git commit -m "chore(graphify): refresh knowledge graph"
```

- [ ] **Bước 3: Typecheck**

```bash
npm run typecheck
```

Mong đợi: exit 0, không output. Fail → sửa trước, mọi plan sau giả định baseline xanh.

- [ ] **Bước 4: Build production**

```bash
npm run build
```

Mong đợi: `next build` xong, route list có `/`, `/b/[slug]`, `/chat`, `/embed/[slug]`, `/dashboard`, `/api/cron/tick`. Build chạy `npm run prepare:eve` trước — fail ở đó là vấn đề toolchain eve, không phải code app.

Lệnh này cũng là Task 1 của [security-headers](2026-07-26-security-headers.md) — để ý output có cảnh báo nào về `headers` / `source` / `path-to-regexp` không.

- [ ] **Bước 5: Ghi lại baseline**

Không commit. Ghi số route và warning vào note phiên làm việc để các plan sau phát hiện hồi quy.

---

## Danh sách plan

| # | Plan | Loại | Bắt buộc để release? |
|---|------|------|----------------------|
| 0 | [setup-reentry](2026-07-26-setup-reentry.md) — tenant skip Cal.com bị kẹt vĩnh viễn, không đưa trang booking lên live được | code | **CHẶN** — nặng nhất nhóm này |
| 0b | [security-headers](2026-07-26-security-headers.md) — `frame-ancestors` / `X-Frame-Options` khai trong `next.config.ts` nhưng **không có trong response** | code | **CHẶN** nếu Task 1 xác nhận hỏng cả ở production |
| 1 | [smoke-refresh](2026-07-26-smoke-refresh.md) — chạy `docs/SMOKE.md` lần đầu ở local (phần **viết lại đã xong**) | gate | **Có** — mọi kiểm chứng thủ công dựa vào nó |
| 2 | [legal-pages](2026-07-26-legal-pages.md) — `/terms` + `/privacy` + link footer | code | **Có** |
| 3 | [signup-gate](2026-07-26-signup-gate.md) — `EVE_SIGNUP_MODE=open\|invite_only` | code | **Có** |
| 4 | [durable-rate-limit](2026-07-26-durable-rate-limit.md) — chuyển giới hạn lượt chat vào Postgres | code + migration | **Có** |
| 5 | [production-env](2026-07-26-production-env.md) — checklist env prod + curl sau deploy | docs | **Có** |
| 6 | [cal-key-tool-errors](2026-07-26-cal-key-tool-errors.md) — tool không throw khi thiếu Cal key | code | Nên có |
| 7 | [seo-robots](2026-07-26-seo-robots.md) — `robots.txt` + noindex embed/invite | code | Nên có |
| 8 | [error-monitoring](2026-07-26-error-monitoring.md) — nơi lỗi server hiện ra | code/ops | Nên có |
| 9 | [migration-rollback](2026-07-26-migration-rollback.md) — runbook quay lui + kill switch | docs | Nên có |
| 10 | [staging-smoke-run](2026-07-26-staging-smoke-run.md) — chạy toàn bộ smoke trên preview deploy | gate | **Có** — cổng cuối |

---

## Thứ tự

```
Task 0 (baseline)
   │
   ├── setup-reentry ─────────────┐   ← CHẶN, làm trước mọi plan code
   ├── security-headers ──────────┤   ← CHẶN nếu hỏng thật; Task 1 chỉ tốn 1 lệnh build
   │                              │
   ├── legal-pages                │
   ├── signup-gate                │   ← độc lập nhau, làm liên tiếp cũng được
   ├── seo-robots                 │
   ├── cal-key-tool-errors        │
   │                              │
   ├── durable-rate-limit         │   ← đụng agent channel, commit riêng
   │                              │
   ├── error-monitoring           │
   ├── migration-rollback         │
   ├── production-env ────────────┤
   │                              │
   ├── smoke-refresh ─────────────┤   ← chạy SMOKE ở local, cần setup-reentry xong trước
   │                              │
   └────────────────► staging-smoke-run   ← cổng cuối, cần tất cả ở trên
```

**Tối thiểu để release:** Task 0 → setup-reentry, security-headers → legal-pages, signup-gate, durable-rate-limit, production-env → smoke-refresh → staging-smoke-run.

Bốn plan còn lại (seo-robots, cal-key-tool-errors, error-monitoring, migration-rollback) nên có, nhưng release được nếu user chấp nhận rủi ro.

---

## Câu hỏi cần user trả lời

Ba câu đầu chặn plan tương ứng — hỏi trước khi bắt đầu plan đó:

1. **Email liên hệ** cho trang pháp lý ([legal-pages](2026-07-26-legal-pages.md) bước 5) — không đoán được.
2. **Chế độ đăng ký lúc ra mắt** ([signup-gate](2026-07-26-signup-gate.md)) — `open` hay `invite_only`?
3. **Giám sát lỗi** ([error-monitoring](2026-07-26-error-monitoring.md)) — Sentry, log drain, hay chấp nhận Vercel logs cho v1? (v1 chọn Vercel logs là hợp lệ.)
4. **Pháp nhân / khu vực tài phán** cho trang Terms — bản nháp cố tình không nêu tên công ty. Rà soát pháp lý có nằm trong phạm vi không?

---

## Đã chốt (không bàn lại)

- **Resend**: domain đã verify. Các bước email trong SMOKE chạy thật được, **không** được đánh SKIP với lý do "chưa có Resend".
- **Git workflow**: sửa thẳng `main`, commit từng task. Không branch, không worktree.
- **`docs/SMOKE.md`**: sửa chứ không xoá — repo không có test tự động nào, nó là artifact kiểm chứng duy nhất. Chống trôi bằng bảng "Bảo trì" + mục 11 `AGENTS.md`.
