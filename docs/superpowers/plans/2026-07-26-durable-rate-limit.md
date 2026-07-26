# Giới hạn lượt chat bền vững (Postgres) — Implementation Plan

> **For agentic workers:** Thực thi task-by-task, đánh dấu checkbox (`- [ ]`) để theo dõi.
>
> **Sửa thẳng vào `main`.** Không tạo branch, không tạo git worktree — chủ dự án làm một mình một dự án và đã quyết vậy. Nếu bạn dùng `superpowers:executing-plans` hay `superpowers:subagent-driven-development`, **bỏ qua bước `using-git-worktrees`** của chúng và coi đây là sự đồng ý rõ ràng để làm trên `main`.
>
> Đổi lại: **commit từng task một**, message rõ ràng. Đó là cách quay lui khi hỏng (`git revert <sha>`) — thứ mà branch từng lo, giờ commit nhỏ lo.
>
> Thuộc nhóm [Release Readiness](2026-07-26-release-readiness.md). **Land một mình** — plan này đụng agent channel.

**Goal:** Giới hạn lượt chat công khai thành một trần thật, chia sẻ giữa mọi instance serverless, thay vì một `Map` mỗi tiến trình.

**Architecture:** Hai tầng. Tầng 1 giữ nguyên `Map` trong tiến trình làm bộ chặn rẻ tiền cho các đợt spam hiển nhiên. Tầng 2 là bộ đếm Postgres sau một hàm `security definer`, gọi bằng service-role client — đây mới là trần thật. **Fail-open** khi DB lỗi: bộ đếm hỏng không được làm sập chat.

**Tech Stack:** Postgres (`plpgsql`, `security definer`, `select … for update`), Supabase admin client, eve `eveChannel.onMessage`.

**Vì sao chặn release:** `lib/agent-rate-limit.ts:8` giữ bucket trong `Map` cấp module. Trên Vercel mỗi instance có `Map` riêng, nên "30 lượt/giờ" thực chất là 30 × số instance đang nóng, và reset mỗi lần cold start. Đây là thứ duy nhất đứng giữa một con scraper và hoá đơn LLM không giới hạn.

## Global Constraints

- Không có test runner — kiểm chứng bằng `psql` qua `supabase db execute` + thử tay trên trình duyệt.
- Migration mới, timestamp sort sau `20260726000001`. Không sửa migration cũ.
- Bảng mới **bật RLS và không có policy nào** — chỉ service-role chạm tới. Đây không phải bảng tenant nên không cần cột `workspace_id`, nhưng key có tiền tố `w:` để đếm theo workspace.
- Sau khi sửa code: `graphify update .`.

## Điều đã xác minh trước khi lập plan

`onMessage` **được phép async**: `EveMessageResultOrPromise = EveMessageResult | Promise<EveMessageResult>` (`node_modules/eve/dist/src/public/channels/eve.d.ts:59`, dùng ở dòng 91). Nên `await` được trong handler mà không phải đổi kiến trúc channel.

## File Structure

- **Tạo:** `supabase/migrations/20260726000002_agent_rate_limits.sql` — bảng + 2 hàm. Toàn bộ logic tăng/reset nằm trong DB để tránh race giữa các instance.
- **Viết lại:** `lib/agent-rate-limit.ts` — cùng vai trò, đổi `checkAgentRateLimit` thành async. Giữ `clientIpFromRequest` nguyên xi.
- **Sửa:** `agent/channels/eve.ts:60-86` — `onMessage` thành async.
- **Sửa:** `app/api/cron/tick/route.ts` — dọn bucket cũ.
- **Sửa:** `docs/SMOKE.md` — thêm mục kiểm chứng.

---

### Task 1: Migration — bảng đếm + hàm tăng

**Files:**
- Create: `supabase/migrations/20260726000002_agent_rate_limits.sql`

**Interfaces:**
- Produces:
  - bảng `public.agent_rate_limits (bucket_key text pk, window_start timestamptz, count integer)`
  - `public.bump_agent_rate_limit(p_key text, p_window_seconds integer, p_max integer) returns boolean` — `true` = cho qua, `false` = vượt trần
  - `public.prune_agent_rate_limits() returns void`

- [ ] **Bước 1: Viết migration**

Tạo `supabase/migrations/20260726000002_agent_rate_limits.sql`:

```sql
-- Durable replacement for the in-memory agent rate limiter (per-process Map).
create table if not exists public.agent_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.agent_rate_limits enable row level security;
-- Intentionally no policies: service-role only, never read from the client.

create index if not exists agent_rate_limits_window_start_idx
  on public.agent_rate_limits (window_start);

create or replace function public.bump_agent_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_start timestamptz;
begin
  insert into public.agent_rate_limits (bucket_key, window_start, count)
  values (p_key, now(), 0)
  on conflict (bucket_key) do nothing;

  select window_start, count
    into v_start, v_count
    from public.agent_rate_limits
   where bucket_key = p_key
     for update;

  if v_start + make_interval(secs => p_window_seconds) <= now() then
    update public.agent_rate_limits
       set window_start = now(), count = 1
     where bucket_key = p_key;
    return true;
  end if;

  if v_count >= p_max then
    return false;
  end if;

  update public.agent_rate_limits
     set count = count + 1
   where bucket_key = p_key;
  return true;
end;
$$;

revoke all on function public.bump_agent_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- Housekeeping: drop buckets untouched for a day. Called from /api/cron/tick.
create or replace function public.prune_agent_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.agent_rate_limits
   where window_start < now() - interval '1 day';
$$;

revoke all on function public.prune_agent_rate_limits()
  from public, anon, authenticated;
```

`select … for update` là mấu chốt: nó tuần tự hoá các lần tăng đồng thời trên cùng một key, thứ mà `Map` không làm được giữa các instance.

- [ ] **Bước 2: Áp dụng migration**

```bash
npx supabase db reset
```

Mong đợi: mọi migration apply sạch, kể cả file mới.

- [ ] **Bước 3: Kiểm chứng hàm đếm đúng trần**

```bash
npx supabase db execute --sql "select public.bump_agent_rate_limit('test:1', 3600, 2), public.bump_agent_rate_limit('test:1', 3600, 2), public.bump_agent_rate_limit('test:1', 3600, 2);"
```

Mong đợi: `t, t, f` — lần thứ ba bị từ chối.

- [ ] **Bước 4: Kiểm chứng cửa sổ reset**

```bash
npx supabase db execute --sql "select public.bump_agent_rate_limit('test:2', 1, 1); select pg_sleep(1.2); select public.bump_agent_rate_limit('test:2', 1, 1);"
```

Mong đợi: `t` … `t` — cửa sổ 1 giây đã trôi qua nên lượt thứ hai được phép.

- [ ] **Bước 5: Kiểm chứng client thường không gọi được hàm**

```bash
npx supabase db execute --sql "set role anon; select public.bump_agent_rate_limit('test:3', 60, 1);"
```

Mong đợi: lỗi permission denied. Nếu **chạy được** thì `revoke` chưa ăn — sửa migration trước khi đi tiếp.

- [ ] **Bước 6: Commit**

```bash
git add supabase/migrations/20260726000002_agent_rate_limits.sql
git commit -m "feat(db): add durable agent rate limit table and bump function"
```

---

### Task 2: Viết lại `lib/agent-rate-limit.ts`

**Files:**
- Rewrite: `lib/agent-rate-limit.ts`

**Interfaces:**
- Consumes: `createAdminClient()` từ `@/lib/supabase/admin`, RPC `bump_agent_rate_limit` từ Task 1
- Produces:
  - `checkAgentRateLimit(input: { visitorId?: string | null; ip?: string | null; workspaceSlug?: string | null }): Promise<{ ok: true } | { ok: false; errorCode: "agent_rate_limited" }>` — **đổi thành async**, thêm tham số `workspaceSlug`
  - `clientIpFromRequest(request: Request): string | null` — **không đổi**

- [ ] **Bước 1: Thay toàn bộ nội dung file**

```ts
/**
 * Rate limit for public Eve agent turns.
 *
 * Two layers:
 *  1. per-process Map — cheap short-circuit for obvious floods on one instance
 *  2. Postgres counter — the real ceiling, shared across serverless instances
 *
 * Fail-open on DB errors: a broken counter must not take the chat down.
 */
import { createAdminClient } from "@/lib/supabase/admin";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const VISITOR_WINDOW_SECONDS = 60 * 60;
const VISITOR_MAX_PER_WINDOW = 30;
const WORKSPACE_WINDOW_SECONDS = 24 * 60 * 60;
const WORKSPACE_MAX_PER_WINDOW = 2000;

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/** Local map check. Returns false when this process alone already saw too many. */
function allowedLocally(keys: string[], windowMs: number, max: number): boolean {
  const now = Date.now();
  prune(now);

  for (const key of keys) {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt > now && bucket.count >= max) return false;
  }
  for (const key of keys) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
    }
  }
  return true;
}

async function allowedInDb(
  key: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("bump_agent_rate_limit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) {
      console.error("[agent-rate-limit] rpc failed", error.message);
      return true; // fail open
    }
    return data !== false;
  } catch (error) {
    console.error("[agent-rate-limit] rpc threw", error);
    return true; // fail open
  }
}

export async function checkAgentRateLimit(input: {
  visitorId?: string | null;
  ip?: string | null;
  workspaceSlug?: string | null;
}): Promise<{ ok: true } | { ok: false; errorCode: "agent_rate_limited" }> {
  const visitorKeys = [
    input.visitorId?.trim() ? `v:${input.visitorId.trim()}` : null,
    input.ip?.trim() ? `ip:${input.ip.trim()}` : null,
  ].filter(Boolean) as string[];
  if (visitorKeys.length === 0) visitorKeys.push("anon");

  if (
    !allowedLocally(
      visitorKeys,
      VISITOR_WINDOW_SECONDS * 1000,
      VISITOR_MAX_PER_WINDOW,
    )
  ) {
    return { ok: false, errorCode: "agent_rate_limited" };
  }

  for (const key of visitorKeys) {
    const ok = await allowedInDb(
      key,
      VISITOR_WINDOW_SECONDS,
      VISITOR_MAX_PER_WINDOW,
    );
    if (!ok) return { ok: false, errorCode: "agent_rate_limited" };
  }

  const slug = input.workspaceSlug?.trim().toLowerCase();
  if (slug) {
    const ok = await allowedInDb(
      `w:${slug}`,
      WORKSPACE_WINDOW_SECONDS,
      WORKSPACE_MAX_PER_WINDOW,
    );
    if (!ok) return { ok: false, errorCode: "agent_rate_limited" };
  }

  return { ok: true };
}

export function clientIpFromRequest(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}
```

Trần workspace 2000 lượt/ngày là chặn thảm hoạ, không phải chặn dùng thật — một tenant bận rộn không tới gần con số đó. Chỉnh sau khi có dữ liệu analytics thật.

- [ ] **Bước 2: Typecheck để thấy chỗ gọi bị vỡ**

```bash
npm run typecheck
```

Mong đợi: **fail** ở `agent/channels/eve.ts:66` — `checkAgentRateLimit` giờ trả `Promise`, không còn `.ok` đồng bộ. Đây là kết quả đúng; Task 3 sửa nó.

- [ ] **Bước 3: Chưa commit**

Cây nguồn đang không typecheck được. Commit cùng Task 3.

---

### Task 3: Nối vào channel + dọn dẹp trong cron

**Files:**
- Modify: `agent/channels/eve.ts:60-86`
- Modify: `app/api/cron/tick/route.ts` (sau vòng lặp digest, dòng ~90)

**Interfaces:**
- Consumes: `checkAgentRateLimit` (async) từ Task 2, `EVE_WORKSPACE_HEADER` (đã import sẵn ở `eve.ts:11`), `createAdminClient` (đã import sẵn ở `route.ts:3`)
- Produces: không export mới.

- [ ] **Bước 1: Đổi `onMessage` thành async**

Trong `agent/channels/eve.ts`, thay dòng 60-86 bằng:

```ts
  onMessage: async (ctx) => {
    const request = ctx.eve.request;
    const visitorId = readVisitorIdFromCookieHeader(
      request.headers.get("cookie"),
    );
    const ip = clientIpFromRequest(request);
    const workspaceSlug = request.headers
      .get(EVE_WORKSPACE_HEADER)
      ?.trim()
      .toLowerCase();
    const limited = await checkAgentRateLimit({ visitorId, ip, workspaceSlug });
    if (!limited.ok) {
      // Soft-stamp so tools/instructions can surface a friendly limit message.
      const base = defaultEveAuth(ctx);
      if (!base) return { auth: null };
      return {
        auth: {
          ...base,
          attributes: {
            ...base.attributes,
            agentRateLimited: "1",
            visitorId: visitorId ?? "",
          },
        },
      };
    }

    return {
      auth: withTenantAttributes(request, defaultEveAuth(ctx)),
    };
  },
```

Cách xử lý khi vượt trần giữ nguyên (soft-stamp `agentRateLimited`) — agent vẫn trả lời tử tế thay vì ném 429 vào mặt khách.

- [ ] **Bước 2: Dọn bucket cũ trong cron tick**

Trong `app/api/cron/tick/route.ts`, trong `GET`, sau vòng lặp digest (kết thúc ~dòng 90) và **trước** khối reminders:

```ts
  try {
    await createAdminClient().rpc("prune_agent_rate_limits");
  } catch (error) {
    console.error("[cron/tick] rate-limit prune failed", error);
  }
```

`createAdminClient` đã import ở dòng 3.

- [ ] **Bước 3: Typecheck**

```bash
npm run typecheck
```

Mong đợi: exit 0.

- [ ] **Bước 4: Kiểm chứng trần thật sự chặn**

Tạm đổi `VISITOR_MAX_PER_WINDOW = 3` trong `lib/agent-rate-limit.ts`, rồi:

```bash
npm run dev
```

Gửi 4 tin nhắn trên `http://localhost:3000/b/eve-pilot`. Mong đợi: lượt thứ 4 trả lời kiểu "đã đạt giới hạn", không crash, không stack trace.

```bash
npx supabase db execute --sql "select bucket_key, count from public.agent_rate_limits order by count desc limit 5;"
```

Mong đợi: có row `v:…` với `count = 3`, và row `w:eve-pilot`.

- [ ] **Bước 5: Khôi phục hằng số**

Đổi `VISITOR_MAX_PER_WINDOW` về `30`. **Không được commit giá trị 3.**

```bash
grep -n "VISITOR_MAX_PER_WINDOW = " lib/agent-rate-limit.ts
```

Mong đợi: `VISITOR_MAX_PER_WINDOW = 30`.

- [ ] **Bước 6: Kiểm chứng fail-open**

```bash
npx supabase stop
npm run dev
```

Gửi một tin nhắn chat. Mong đợi: chat vẫn trả lời (hoặc lỗi vì lý do DB khác), log server có `[agent-rate-limit] rpc` — bộ giới hạn **không** được là thứ làm hỏng chat.

```bash
npx supabase start
```

- [ ] **Bước 7: Kiểm chứng cron gọi được prune**

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

Mong đợi: JSON `{"ok":true,…}`, log không có `rate-limit prune failed`.

- [ ] **Bước 8: graph + commit**

```bash
graphify update .
git add lib/agent-rate-limit.ts agent/channels/eve.ts app/api/cron/tick/route.ts graphify-out
git commit -m "feat(agent): move turn rate limit into Postgres with per-workspace ceiling"
```

---

### Task 4: Ghi vào SMOKE.md

**Files:**
- Modify: `docs/SMOKE.md` — danh sách migration trong Prerequisites + section mới

**Interfaces:**
- Consumes: hành vi đã kiểm chứng ở Task 3
- Produces: mục checklist cho [staging-smoke-run](2026-07-26-staging-smoke-run.md).

> Nếu [smoke-refresh](2026-07-26-smoke-refresh.md) chưa chạy, vẫn thêm bình thường — plan đó sẽ hợp nhất.

- [ ] **Bước 1: Thêm migration vào Prerequisites**

Thêm vào cuối danh sách migration:

```markdown
  - `20260726000002_agent_rate_limits.sql` (giới hạn lượt agent bền vững)
```

- [ ] **Bước 2: Thêm section**

Sau section "Outbound reminders (cron)":

```markdown
## Agent rate limit

1. [ ] Migration `20260726000002_agent_rate_limits.sql` đã apply
2. [ ] Lượt thứ 31 từ cùng một visitor trong 1 giờ → trả lời báo giới hạn, không crash
3. [ ] `select * from public.agent_rate_limits` có cả bucket `v:` và bucket `w:`
4. [ ] `set role anon; select public.bump_agent_rate_limit(...)` → permission denied
5. [ ] Dừng Supabase → chat vẫn trả lời (fail open, chỉ log ra stderr)
6. [ ] `/api/cron/tick` chạy xong không lỗi prune
```

- [ ] **Bước 3: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: add agent rate limit checks to smoke checklist"
```

---

## Self-review trước khi đóng plan

- [ ] `VISITOR_MAX_PER_WINDOW = 30` trong bản commit (không phải 3)
- [ ] `anon` không gọi được cả hai hàm mới
- [ ] Chat vẫn sống khi DB chết (fail-open đã kiểm chứng thật, không chỉ đọc code)
- [ ] `clientIpFromRequest` giữ nguyên chữ ký — không chỗ gọi nào khác bị vỡ
- [ ] Bảng `agent_rate_limits` bật RLS và **không** có policy nào
