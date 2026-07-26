# Runbook quay lui + kill switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md).

**Goal:** Có câu trả lời viết sẵn cho "deploy hỏng rồi, giờ làm gì" — trước khi cần tới nó.

**Architecture:** Chỉ tài liệu, thêm vào `docs/MIGRATIONS.md`. Giá trị nằm ở việc **kiểm chứng** từng kill switch là thật, không phải ở việc viết cho hay.

**Tech Stack:** Markdown.

**Vì sao cần:** 13 migration, không có down-script nào, và `docs/MIGRATIONS.md:38-41` đã cảnh báo cutover prod là cửa một chiều. Release cần một câu trả lời viết ra giấy.

## Global Constraints

- Không sửa code.
- Mọi kill switch trong bảng phải **tự kiểm chứng được** trước khi viết vào. Một kill switch không hoạt động còn tệ hơn không có, vì lúc sự cố sẽ có người tin nó.
- Giữ nguyên định dạng `docs/MIGRATIONS.md` (bảng, heading `##`).

---

### Task 1: Kiểm chứng từng kill switch trước khi viết

**Files:** không sửa file — đây là bước điều tra, và nó phải đi trước Task 2.

**Interfaces:**
- Consumes: `app/api/cron/tick/route.ts:9-14`, `lib/signup-mode.ts` (nếu [signup-gate](2026-07-26-signup-gate.md) đã land), `lib/workspace.ts:359-387`, `lib/models.ts`
- Produces: danh sách kill switch đã xác nhận, để Task 2 viết vào.

- [ ] **Bước 1: Kill switch cron**

```bash
grep -n "CRON_SECRET" app/api/cron/tick/route.ts
```

Xác nhận `authorize()` trả `false` khi secret rỗng (dòng 10-11). Nghĩa là **bỏ** `CRON_SECRET` = dừng mọi công việc nền. Xác minh tại local:

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/tick
```

Với `CRON_SECRET` bỏ khỏi `.env.local` → mong đợi `401`.

- [ ] **Bước 2: Kill switch signup**

```bash
grep -n "EVE_SIGNUP_MODE" lib/signup-mode.ts
```

Có file → kill switch là thật, đưa vào bảng. Chưa có ([signup-gate](2026-07-26-signup-gate.md) chưa land) → **bỏ dòng đó khỏi bảng**, thêm lại sau khi plan kia xong.

- [ ] **Bước 3: Kill switch LLM**

```bash
grep -n "envKeyFor\|hasProviderKey" lib/models.ts
```

Xác nhận điều gì xảy ra khi mọi provider key vắng mặt. Nếu nó ném lỗi thay vì suy giảm mượt mà, viết đúng như vậy — "chat sẽ lỗi", không phải "chat suy giảm nhẹ nhàng".

- [ ] **Bước 4: Kill switch theo tenant**

Xác nhận việc xoá `cal_api_key_encrypted` của một workspace làm tool đặt lịch trả lỗi có cấu trúc chứ không crash. Đây chính là hành vi mà [cal-key-tool-errors](2026-07-26-cal-key-tool-errors.md) tạo ra — **chưa land plan đó thì kill switch này gây stack trace**, phải ghi rõ điều đó trong bảng.

- [ ] **Bước 5: Ghi lại kết quả**

Viết ra bốn kết luận. Task 2 chỉ được viết những gì bước này xác nhận.

---

### Task 2: Viết section Rollback

**Files:**
- Modify: `docs/MIGRATIONS.md` — chèn sau section `## Remote / prod cutover` (kết thúc dòng 41)

**Interfaces:**
- Consumes: kết luận từ Task 1
- Produces: runbook cho lúc sự cố.

- [ ] **Bước 1: Chèn section**

```markdown
## Rollback

Repo này **không có down-migration**. Quay lui nghĩa là quay lui *app*, không phải schema.

**Quy tắc: mọi migration phải tương thích ngược với phiên bản app trước đó.**
Chỉ thêm — bảng mới, cột mới nullable, hàm mới. Không bao giờ drop hay rename cột trong cùng release ngừng dùng nó; tách làm hai release.

### Khi một deploy hỏng

1. **Quay lui app trước.** Vercel → Deployments → deploy tốt gần nhất → Promote to Production. Code cũ chạy với schema mới — an toàn nếu migration chỉ thêm.
2. **Đừng đụng schema.** Không `drop table` khi app đang chạy.
3. Nếu chính migration là vấn đề (hàm sai, constraint sai), ship một migration **mới** để sửa hoặc gỡ đối tượng đó. Không bao giờ sửa file đã apply.

### Kill switch khẩn cấp (không cần deploy code)

| Vấn đề | Công tắc |
|--------|----------|
| Chi phí LLM tăng vọt | Đặt spend limit ở phía provider, hoặc bỏ provider key trong Vercel env → chat lỗi, dashboard vẫn sống |
| Email nhắc lịch gửi sai | Bỏ `CRON_SECRET` trong Vercel env → `/api/cron/tick` trả 401 cho mọi request, mọi việc nền dừng |
| Đăng ký bị lạm dụng | Đặt `EVE_SIGNUP_MODE=invite_only` trong Vercel env |
| Chat của một tenant hỏng | Xoá `cal_api_key_encrypted` của workspace đó → tool đặt lịch trả `CAL_NOT_CONFIGURED` |

Đổi env trên Vercel cần redeploy mới có hiệu lực — dùng "Redeploy" trên deployment hiện tại, thao tác này **không** build lại từ commit mới.

### Trước mỗi release

- [ ] Migration mới chỉ thêm, không xoá/đổi tên
- [ ] Phiên bản app trước đã chạy thử với schema mới (hoặc chấp nhận rõ ràng đây là cửa một chiều)
- [ ] Ghi lại URL deploy production hiện tại để promote ngược khi cần
```

Bỏ hoặc sửa dòng nào Task 1 không xác nhận được.

- [ ] **Bước 2: Kiểm chứng liên kết chéo**

```bash
grep -n "Rollback" docs/MIGRATIONS.md
grep -n "MIGRATIONS" docs/SMOKE.md
```

`docs/SMOKE.md` chưa trỏ tới runbook rollback → thêm vào section `## Commands`:

```markdown
Deploy hỏng: xem [rollback + kill switch](./MIGRATIONS.md#rollback).
```

- [ ] **Bước 3: Commit**

```bash
git add docs/MIGRATIONS.md docs/SMOKE.md
git commit -m "docs: add migration rollback and emergency kill-switch runbook"
```

---

## Self-review trước khi đóng plan

- [ ] Mọi kill switch trong bảng đã được **thử thật** ở Task 1, không phải suy ra từ đọc code
- [ ] Dòng `EVE_SIGNUP_MODE` chỉ có mặt nếu [signup-gate](2026-07-26-signup-gate.md) đã land
- [ ] Dòng "xoá cal key" ghi rõ nó cần [cal-key-tool-errors](2026-07-26-cal-key-tool-errors.md) mới sạch
- [ ] Có ghi rằng đổi env trên Vercel cần redeploy — thiếu ý này thì kill switch trông như không ăn
