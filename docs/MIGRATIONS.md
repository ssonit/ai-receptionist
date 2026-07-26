# Supabase migrations workflow

## Active path

| What | Location |
|------|----------|
| **Schema (single init)** | `supabase/migrations/20260724000001_init_schema.sql` |
| **Demo / pilot data** | `supabase/seed.sql` |
| **Old incremental history** | `supabase/migrations_archive/` (reference only) |

```bash
npx supabase start
npx supabase db reset   # init_schema.sql + seed.sql
```

`db reset` recreates the local DB, applies the init migration, then seeds Eve Pilot.

## Schema changes going forward

1. Add a **new** timestamped file under `supabase/migrations/` (never edit `init_schema` after it ships).
2. Keep `supabase/baseline/001_schema.sql` in sync when you change the desired end-state (optional mirror for reading).

## Seed vs schema

- **Schema** — tables, RLS, triggers in `migrations/`
- **Seed** — Eve Pilot workspace + demo FAQ in `seed.sql` (local/demo + marketing `/chat` sandbox)

**Cal.com:** Eve Pilot credentials must use a sandbox calendar only. Tenant Cal keys live on each workspace after setup.

Signup creates a new workspace via `handle_new_user()` unless `raw_user_meta_data.invite_token` is set — then the user joins that workspace as **staff** (no new workspace). Public tenant URL: `/b/{slug}`. Product demo: `/chat` (always pilot).

## Archived history

See [`supabase/migrations_archive/README.md`](../supabase/migrations_archive/README.md) and [`supabase/MIGRATION_INVENTORY.md`](../supabase/MIGRATION_INVENTORY.md).

## Remote / prod cutover

Projects that already applied the old 20 migrations **cannot** simply switch to `init_schema` on the same database — migration versions will conflict. Options:

- **New project or full reset** — use init migration + seed (or prod seed policy).
- **Existing prod** — stay on old history until a deliberate rebuild, or squash only on a brand-new Supabase project.

## Rollback

Repo này **không có down-migration**. Quay lui nghĩa là quay lui *app*, không phải schema.

**Quy tắc: mọi migration phải tương thích ngược với phiên bản app trước đó.**
Chỉ thêm — bảng mới, cột mới nullable, hàm mới. Không bao giờ drop hay rename cột trong cùng release ngừng dùng nó; tách làm hai release.

### Khi một deploy hỏng

1. **Quay lui app trước.** Vercel → Deployments → deploy tốt gần nhất → Promote to Production. Code cũ chạy với schema mới — an toàn nếu migration chỉ thêm.
2. **Đừng đụng schema.** Không `drop table` khi app đang chạy.
3. Nếu chính migration là vấn đề (hàm sai, constraint sai), ship một migration **mới** để sửa hoặc gỡ đối tượng đó. Không bao giờ sửa file đã apply.

### Kill switch khẩn cấp (không cần deploy code)

Đã kiểm chứng local 2026-07-26: cron không Bearer → `401`; `isPublicSignupOpen()` đóng khi `invite_only`; thiếu mọi LLM key → `resolveLanguageModel` vẫn gọi provider và chat **lỗi** (không suy giảm im lặng); tool booking bắt thiếu Cal key → `CAL_NOT_CONFIGURED_GUEST` (sau plan cal-key-tool-errors).

| Vấn đề | Công tắc |
|--------|----------|
| Chi phí LLM tăng vọt | Đặt spend limit phía provider, hoặc bỏ provider key trong Vercel env → chat lỗi, dashboard vẫn sống |
| Email nhắc lịch gửi sai | Bỏ `CRON_SECRET` trong Vercel env → `/api/cron/tick` trả 401 cho mọi request, mọi việc nền dừng |
| Đăng ký bị lạm dụng | Đặt `EVE_SIGNUP_MODE=invite_only` trong Vercel env |
| Chat của một tenant hỏng | Xoá `cal_api_key_encrypted` của workspace đó → tool đặt lịch trả `CAL_NOT_CONFIGURED_GUEST` (không stack trace) |

Đổi env trên Vercel cần redeploy mới có hiệu lực — dùng "Redeploy" trên deployment hiện tại; thao tác này **không** build lại từ commit mới.

### Trước mọi release

- [ ] Migration mới chỉ thêm, không xoá/đổi tên
- [ ] Phiên bản app trước đã chạy thử với schema mới (hoặc chấp nhận rõ ràng đây là cửa một chiều)
- [ ] Ghi lại URL deploy production hiện tại để promote ngược khi cần

## Related

- Smoke checklist: [`SMOKE.md`](./SMOKE.md)
- Seed config: `supabase/config.toml` → `[db.seed]`
