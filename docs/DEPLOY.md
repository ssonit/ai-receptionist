# Deploy lên production

> Đối chiếu với code 2026-08-08, `main` @ `45a1e91`. Runbook deploy `eve-booking`
> (Next.js) lên Vercel + Supabase Cloud.
>
> Đây là tài liệu **quy trình** — chi tiết từng phần đã có doc riêng. Khi sửa,
> chỉ sửa link nếu đường dẫn đổi, đừng copy nội dung của các doc đó vào đây
> (tránh lặp lại kiểu trôi khỏi code mà [`SMOKE.md`](./SMOKE.md) đã bị 3 lần —
> xem đầu file đó).
>
> Skill Claude Code bọc quy trình này: `.claude/skills/deploy-vercel` (đặc thù
> app) + `.claude/skills/deploy-to-vercel` (cơ chế CLI Vercel chung, vendor từ
> vercel-labs/agent-skills — đừng sửa tay, re-pull nếu cần update).

## Trước khi bắt đầu

- [ ] Project Supabase riêng cho production — không dùng chung với local/dev
- [ ] Có quyền trên Vercel team sẽ deploy vào
- [ ] Ít nhất 1 API key LLM: `DEEPSEEK_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `ANTHROPIC_API_KEY`
- [ ] Quyết định trước hai cái này — đổi hành vi sản phẩm, không chỉ là config kỹ thuật:
  - `EVE_SIGNUP_MODE`: `open` (ai có URL cũng signup được, mặc định) hay `invite_only`
  - `BILLING_MODE`: `none` (tắt billing, mở hết tính năng) / `test` (checkout giả) / `live` (Polar + SePay thật)

## 1. Vercel — link project

Repo có git remote → cách deploy chuẩn là **git push**, Vercel tự build từ
commit trên nhánh production (`main`). Không cần `vercel deploy` thủ công trừ
khi deploy một nhánh/thư mục cụ thể ngoài luồng git.

Kiểm tra đã link chưa:

```bash
cat .vercel/project.json 2>/dev/null || cat .vercel/repo.json 2>/dev/null || echo "chưa link"
vercel whoami   # xác nhận CLI đã login
```

Chưa link thì:

```bash
vercel login
vercel teams list                        # nhiều team thì chọn đúng team
vercel link --repo --scope <team-slug>   # ưu tiên --repo, match theo git remote đáng tin hơn match theo tên thư mục
```

Các nhánh còn lại (không login được, không có git remote, sandbox không auth
được CLI...): skill `deploy-to-vercel`.

## 2. Supabase production

1. Tạo project mới trên Supabase Cloud — đừng tái dùng project local/dev.
2. Dashboard → Project Settings → API Keys — lấy key format mới
   (`sb_publishable_*` / `sb_secret_*`).
3. Link CLI và áp toàn bộ migration theo đúng thứ tự timestamp (CLI tự sắp
   xếp, không chạy tay từng file trong [`supabase/migrations/`](../supabase/migrations)):
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
4. **Nếu project Supabase này từng chạy lịch sử migration cũ** (trước lần
   squash thành `20260724000001_init_schema.sql`) — đọc mục
   "Remote / prod cutover" trong [`MIGRATIONS.md`](./MIGRATIONS.md) trước;
   `db push` thẳng có thể bị conflict version trên project đã có lịch sử cũ.
5. *(Tuỳ chọn)* Seed workspace demo Eve Pilot — chỉ cần nếu muốn `/chat`
   (link từ landing page marketing) hoạt động. Tenant thật **không** cần bước
   này, signup tự tạo workspace riêng. Cách đơn giản nhất: dán nội dung
   [`supabase/seed.sql`](../supabase/seed.sql) vào SQL Editor trên Dashboard.
   Qua CLI: `psql "$SUPABASE_CONNECTION_STRING" -f supabase/seed.sql`.
6. Xác nhận extension `unaccent` bật (migration slugify tự
   `create extension if not exists` — Supabase Cloud thường tự cho phép, để ý
   nếu dùng Postgres host khác).

## 3. Biến môi trường

Vercel → Project → Settings → Environment Variables. Danh sách đầy đủ kèm
"hỏng thế nào nếu thiếu" từng biến: [`ops/production-env.md`](./ops/production-env.md).
Bảng dưới chỉ phần **bắt buộc theo code** — thiếu là app throw lỗi ngay khi
boot ([`lib/env.ts`](../lib/env.ts)):

| Biến | Ghi chú |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_*` — tên cũ `NEXT_PUBLIC_SUPABASE_ANON_KEY` vẫn fallback được, xem [`lib/supabase/keys.ts`](../lib/supabase/keys.ts) |
| `SUPABASE_SECRET_KEY` | `sb_secret_*` — tên cũ `SUPABASE_SERVICE_ROLE_KEY` vẫn fallback được |

Không nằm trong schema bắt buộc nhưng **nên set tường minh** trước khi mở
public:

| Biến | Vì sao |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Thiếu → `appOrigin()` fallback `localhost:3000`, phá redirect OAuth (Google login, Cal OAuth, Messenger, Zalo) |
| `WORKSPACE_SECRETS_KEY` | Đừng để fallback vào `SUPABASE_SECRET_KEY` — xoay service key sau này sẽ làm mồ côi Cal key đã mã hoá của mọi tenant |
| `CRON_SECRET` | Xem mục 5 — thiếu thì mọi cron request bị 401 lặng lẽ |
| `RESEND_API_KEY` + `EVE_MAIL_FROM` | Thiếu → không gửi được email mời/nhắc lịch, OTP khách rơi về "nhờ nhân viên". Verify domain trước: [`ops/resend-domain-setup.md`](./ops/resend-domain-setup.md) |
| `EVE_SIGNUP_MODE` | Mặc định `open` |
| `BILLING_MODE` | `.env.example` để mặc định `test` (checkout giả) — set `live` nếu bán thật, `none` nếu chưa launch billing |

Tuỳ tính năng (bỏ qua nếu không dùng — không set thì no-op, không crash app):
Cal.com OAuth (`CALCOM_OAUTH_*`), PostHog (`NEXT_PUBLIC_POSTHOG_*`), Sentry
(`NEXT_PUBLIC_SENTRY_DSN`...), Facebook Messenger (`META_*`), Zalo OA
(`ZALO_*`), Google login (`SUPABASE_AUTH_EXTERNAL_GOOGLE_*`). Comment sẵn kèm
link lấy key trong [`.env.example`](../.env.example).

**Đừng copy nguyên `.env.local` sang Vercel** — vài biến chỉ để dùng local:

- `ZALO_DRY_RUN=1` — chỉ để test local, đừng set trên production
- `CALCOM_API_KEY` cấp env chỉ dành cho `/chat` demo Eve Pilot — tenant thật
  cấu hình Cal key riêng qua Dashboard (mã hoá trong DB), không qua env var

Validate trước khi deploy (đọc `.env.local`, chỉ check 3 biến bắt buộc ở
bảng đầu):

```bash
npm run env:check
```

## 4. Build pipeline

`npm run build` không phải `next build` thuần — xem [`package.json`](../package.json):

```
build        = prepare:eve && next build
prepare:eve  = patch:eve && eve build && sync-eve-compile.mjs
postinstall  = patch-eve-package-resolve.mjs
```

- Build Command trên Vercel để trống (mặc định chạy `npm run build`) là đủ —
  nhưng xem build log của lần deploy đầu tiên để chắc `eve build` thật sự
  chạy, không chỉ `next build`.
- **Đừng** tắt install scripts (`--ignore-scripts`) trên Vercel —
  `postinstall` patch package resolution cho `eve`, thiếu bước này build fail
  khó hiểu.

## 5. Cron

[`vercel.json`](../vercel.json) khai báo `/api/cron/tick` chạy
`*/15 * * * *` (nhắc lịch + sync Cal.com). Cần:

- `CRON_SECRET` set trên Vercel — Vercel tự đính
  `Authorization: Bearer $CRON_SECRET` khi gọi cron nhờ đúng tên biến này.
- Gói Vercel hỗ trợ tần suất 15 phút — gói Hobby giới hạn cron chạy thưa hơn.
  Không chạy được thì nới lịch (ví dụ `0 * * * *`) và chấp nhận nhắc lịch
  kém chính xác hơn, còn hơn cron âm thầm không chạy đúng lịch.

## 6. Deploy

```bash
git push
```

Vercel tự build + deploy từ nhánh production. Theo dõi ở Vercel → Deployments.

Chỉ đổi biến môi trường (không đổi code) → **không** tự động redeploy. Bấm
"Redeploy" trên deployment hiện tại để áp env mới — thao tác này không build
lại từ commit mới.

## 7. Sau khi deploy

1. Build log: xác nhận thấy `eve build` chạy (không chỉ `next build` — mục 4).
2. 5 lệnh curl kiểm chứng (cron 401/200, CSP headers, robots.txt): mục
   "Kiểm chứng sau deploy" trong [`ops/production-env.md`](./ops/production-env.md).
3. Vercel → Crons: `/api/cron/tick` có lần chạy 200 trong 15 phút đầu.
4. Chạy tối thiểu mục **Tenant happy path** trong [`SMOKE.md`](./SMOKE.md)
   trên domain production thật — **không** phải `/chat` demo.

## 8. Rollback / sự cố

Chi tiết đầy đủ + bảng kill switch theo từng loại sự cố: mục
[Rollback trong `MIGRATIONS.md`](./MIGRATIONS.md#rollback). Tóm tắt:

- **Code lỗi** → Vercel → Deployments → bản tốt gần nhất → *Promote to
  Production*. Không cần build lại; an toàn vì migration chỉ được thêm
  (additive), không bao giờ xoá/đổi tên cột cùng release.
- **Migration lỗi** → không có down-migration, không sửa file đã apply. Ship
  migration mới để sửa/gỡ đối tượng lỗi.
- **Một tenant hỏng, không phải toàn app** → nghi ngờ
  `workspaces.cal_api_key_encrypted` / `cal_event_type_id` của riêng tenant đó
  trước khi rollback app — lỗi cấu hình per-workspace nhìn giống hệt lỗi
  deploy.

## Bảo trì

Sửa các phần dưới đây thì cập nhật lại mục tương ứng trong doc này, cùng
commit:

| Đụng vào | Cập nhật mục |
|---|---|
| `package.json` (`build`, `postinstall`, `prepare:eve`) | 4. Build pipeline |
| `lib/env.ts` (biến bắt buộc) | 3. Biến môi trường |
| `vercel.json` (cron schedule) | 5. Cron |
| Chiến lược cutover migration | 2. Supabase production + `MIGRATIONS.md` |

## Liên quan

- [`ops/production-env.md`](./ops/production-env.md) — chi tiết từng biến môi trường
- [`MIGRATIONS.md`](./MIGRATIONS.md) — migration workflow + rollback + kill switch
- [`SMOKE.md`](./SMOKE.md) — checklist test thủ công sau deploy
- [`ops/resend-domain-setup.md`](./ops/resend-domain-setup.md) — verify domain gửi email
- `.claude/skills/deploy-vercel`, `.claude/skills/deploy-to-vercel` — skill Claude Code cho quy trình này
