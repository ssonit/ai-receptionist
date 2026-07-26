# Release Readiness — Index

> **Đây là index, không phải plan thực thi.** Mỗi việc có file plan riêng bên dưới. Đọc file này để biết thứ tự và cái nào chặn cái nào, rồi mở đúng plan cần làm.

**Goal:** Đóng các khoảng trống phi-tính-năng giữa `main` hiện tại và bản release công khai đầu tiên của eve-booking.

**Ngày lập:** 2026-07-26. Đối chiếu với `main` tại commit `0bb1d5b`.

---

## Global Constraints (áp dụng cho mọi plan trong nhóm này)

Mỗi plan con lặp lại phần liên quan của nó, nhưng đây là bản đầy đủ:

- **Không có test runner trong repo** (không vitest/jest/playwright trong `package.json`). "Test" trong mọi plan = một lệnh cụ thể kèm output mong đợi, hoặc một bước thủ công có tên trong `docs/SMOKE.md`. **Không được bịa ra `npm test`.**
- **`docs/SMOKE.md` đang lệch code** (xem [smoke-refresh](2026-07-26-smoke-refresh.md)). Không tin nó nguyên văn cho tới khi plan đó xong. Mọi plan khác trích SMOKE **theo tên section, không theo số thứ tự** — vì smoke-refresh sẽ đánh số lại.
- **Lỗi hiển thị cho user:** code trong `lib/errors/app-codes.ts`, copy trong `lib/errors/app-messages.ts`. Không trả chuỗi thô của provider/DB ra UI (`.claude/rules/errors.md`).
- **Tenant isolation:** mọi truy vấn mới `.eq("workspace_id", workspaceId)`. Không `using (true)` RLS trên bảng tenant (`.claude/rules/tenant-isolation.md`).
- **Chuỗi UI sản phẩm** qua `messages/en.json` + `messages/vi.json` (namespace: `chat`, `dashboard`, `common`). Landing page (`app/_components/landing-page.tsx`) hiện hardcode tiếng Anh — giữ nguyên style đó, **không** i18n hoá trong nhóm plan này.
- **Sau khi sửa React/UI:** `npm run doctor`, sửa hết error rồi mới commit (`.claude/rules/react-doctor.md`).
- **Sau khi sửa code:** `graphify update .` (`.claude/rules/graphify.md`).
- **Migration:** file mới, timestamp sort sau `20260726000001`. Không sửa migration đã tồn tại. Không đụng `20260724000001_init_schema.sql`.
- **Commit style** theo lịch sử repo: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore: …`. Mỗi task một commit.

---

## Task 0 — Baseline gate (làm trước mọi plan)

Nhỏ, không có file plan riêng. Làm ngay tại đây.

- [ ] **Bước 1: Kiểm tra cây làm việc**

```bash
git status --short
```

Mong đợi: chỉ 5 file `graphify-out/*` bẩn. Nếu có file nguồn nào bẩn → **dừng, hỏi user**, đừng commit việc lạ.

- [ ] **Bước 2: Commit graph đã sinh lại**

```bash
git add graphify-out/
git commit -m "chore(graphify): refresh knowledge graph after invites work"
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

Mong đợi: `next build` xong, route list có `/`, `/b/[slug]`, `/chat`, `/embed/[slug]`, `/dashboard`, `/api/cron/tick`. Lưu ý build chạy `npm run prepare:eve` trước — fail ở đó là vấn đề toolchain eve, không phải code app.

- [ ] **Bước 5: Ghi lại baseline**

Không commit. Ghi số route và warning vào note phiên làm việc để các plan sau phát hiện hồi quy.

---

## Danh sách plan

| # | Plan | Loại | Bắt buộc để release? |
|---|------|------|----------------------|
| 1 | [smoke-refresh](2026-07-26-smoke-refresh.md) — đồng bộ `docs/SMOKE.md` với code hiện tại | docs | **Có** — mọi kiểm chứng thủ công dựa vào nó |
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
   ├── smoke-refresh ─────────────┐   ← làm sớm, các plan khác trích SMOKE
   ├── legal-pages                │
   ├── signup-gate                │   ← 4 plan này độc lập, chạy song song được
   ├── seo-robots                 │
   ├── cal-key-tool-errors        │
   │                              │
   ├── durable-rate-limit         │   ← đụng agent channel, nên land một mình
   │                              │
   ├── error-monitoring           │
   ├── migration-rollback         │
   └── production-env ────────────┤
                                  │
                          staging-smoke-run   ← cổng cuối, cần tất cả ở trên
```

**Tối thiểu để release:** Task 0 → smoke-refresh, legal-pages, signup-gate, durable-rate-limit, production-env → staging-smoke-run.
Bốn plan còn lại (seo-robots, cal-key-tool-errors, error-monitoring, migration-rollback) nên có, nhưng release được nếu user chấp nhận rủi ro.

---

## Câu hỏi cần user trả lời

Ba câu đầu chặn plan tương ứng — hỏi trước khi bắt đầu plan đó:

1. **Email liên hệ** cho trang pháp lý ([legal-pages](2026-07-26-legal-pages.md) bước 5) — không đoán được.
2. **Chế độ đăng ký lúc ra mắt** ([signup-gate](2026-07-26-signup-gate.md)) — `open` hay `invite_only`?
3. **Giám sát lỗi** ([error-monitoring](2026-07-26-error-monitoring.md)) — Sentry, log drain, hay chấp nhận Vercel logs cho v1?
4. **Pháp nhân / khu vực tài phán** cho trang Terms — bản nháp cố tình không nêu tên công ty. Rà soát pháp lý có nằm trong phạm vi không?
