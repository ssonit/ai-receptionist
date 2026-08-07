# Đồng bộ giờ làm việc (Availability) với Cal.com

**Date:** 2026-08-07  
**Status:** Design approved in conversation — chờ review file spec trước khi viết plan  
**Scope:** Cho chủ tiệm sửa giờ làm việc (weekly hours) ngay trong dashboard eve, đồng bộ 2 chiều với lịch mặc định (`default schedule`) trên Cal.com — không cần vào `app.cal.com/availability` nữa. Chỉ phần "cơ bản": giờ theo tuần, 1 khung/ngày. Không làm: date override, nhiều khung giờ/ngày, nhiều schedule đặt tên khác nhau — chủ tiệm muốn nâng cao thì tự vào Cal.com.  
**Phụ thuộc:** Độc lập với các spec/plan khác đã viết hôm nay (webhook auto-register, drop-custom-reminders) — không chặn nhau.

## 1. Hiện trạng

- `lib/calcom.ts` **không có** hàm nào đọc/ghi lịch làm việc (`schedule`) — chỉ có booking/event-type/webhook.
- Chủ tiệm phải tự vào `app.cal.com/availability/{id}` (ảnh chụp màn hình trong hội thoại) để set giờ.
- `workspaces.business_hours` (text tự do) đang hiển thị giờ cho khách/AI (FAQ, booking page) nhưng **không liên kết gì với lịch thật của Cal.com** — 2 nguồn có thể lệch nhau (chủ tiệm gõ "mở tới 20h" trong khi Cal.com thật chỉ tới 17h).
- `business_hours` được sửa trong `app/_components/workspace-agent-studio.tsx` (trang `/dashboard/agent`) — component này gộp chung 3 field (`about`, `business_hours`, `services_summary`) trong cùng 1 form, có chế độ "bullet list" / "raw text" cho từng field. Action lưu: `app/dashboard/agent/actions.ts:95` (`business_hours: optionalText(formData, "business_hours")`).

## 2. Cal.com API — xác nhận khả thi

Tra trực tiếp docs (xem Sources), khác hẳn Workflows (mục reminders hôm nay) — **có API đầy đủ**:

- `GET /v2/schedules/default` — lấy lịch mặc định của tài khoản.
- `PATCH /v2/schedules/{id}` — sửa.
- `POST /v2/schedules` — tạo (case tài khoản chưa có lịch mặc định nào).
- Format: `availability: [{ days: ["Monday", ...], startTime: "09:00", endTime: "17:00" }]`, cộng `timeZone`, `isDefault`.
- `cal-api-version` cho nhóm endpoint này: `2024-06-11` (khác `2024-08-13` dùng cho booking/webhook — xác nhận qua ví dụ curl trong docs, nên kiểm chứng lại bằng response thật lúc code, theo đúng tinh thần đã làm với webhook).
- **OAuth cần scope `SCHEDULE_WRITE`** — hiện KHÔNG có trong `CAL_OAUTH_SCOPES` (`lib/cal-oauth.ts`). API key không giới hạn scope, không vướng. Đúng lặp lại tình huống webhook — xử lý giống hệt: cứ làm, log rõ nếu 403 do thiếu scope, không chặn UI.

## 3. Quyết định thiết kế

| Chủ đề | Chọn |
|---|---|
| Phạm vi UI | Giờ theo tuần, 1 khung/ngày, bật/tắt từng ngày — khớp đúng phần cơ bản trong ảnh chụp Cal.com |
| Lưu trữ | **Không mirror vào Supabase** — đọc/ghi trực tiếp Cal.com mỗi lần vào trang, giữ đúng nguyên tắc "Cal.com là nguồn sự thật cho availability" đã dùng xuyên suốt hôm nay |
| Case chưa có schedule mặc định | `GET default` rỗng/404 → `POST` tạo mới với giờ nhập, `isDefault: true` |
| `business_hours` | Tự sinh từ lịch Cal.com thật mỗi khi lưu giờ làm việc — **bỏ ô nhập tay** trong `workspace-agent-studio.tsx`. Không đụng `about`/`services_summary` (dùng chung component, giữ nguyên) |
| OAuth scope thiếu | Không chặn — best-effort, giống pattern webhook |

## 4. Kiến trúc

### 4.1 `lib/calcom.ts` — 3 hàm mới

```
getDefaultSchedule(): GET /v2/schedules/default
createSchedule(input): POST /v2/schedules
updateSchedule(id, input): PATCH /v2/schedules/{id}
```

### 4.2 Formatter — tái dùng, không thêm phụ thuộc DB mới

Hàm thuần `formatScheduleAsBusinessHours(schedule, locale)` — chuyển `availability` array thành chuỗi bullet đúng format hiện có (`DEFAULT_WORKSPACE_BUSINESS_HOURS` làm mẫu: `"- Thứ 2–Thứ 6: 09:00–17:00"`).

### 4.3 UI mới — card "Working hours" trong `/dashboard/settings`

7 dòng Thứ 2 → CN, mỗi dòng: toggle + giờ bắt đầu/kết thúc. Nút Save:
1. Gọi `updateSchedule()` (hoặc `createSchedule()` nếu chưa có) — cập nhật Cal.com.
2. Cùng lúc, ghi `workspaces.business_hours = formatScheduleAsBusinessHours(...)` — 1 admin update, không qua form `workspace-agent-studio.tsx`.

### 4.4 Gỡ ô nhập tay `business_hours` khỏi `workspace-agent-studio.tsx`

Xoá state/UI riêng cho `businessHours`/`hoursRawMode`/`hourLines` và `<input name="business_hours" ...>` — **giữ nguyên** state/UI cho `about`/`servicesSummary` (dùng chung `parseBulletLines`/`serializeBulletLines`/`looksLikeBulletList`, không xoá các hàm này). Bỏ `business_hours: optionalText(...)` khỏi `app/dashboard/agent/actions.ts:95`.

## 5. Testing (tóm tắt — chi tiết trong plan)

- `getDefaultSchedule`/`createSchedule`/`updateSchedule`: test gián tiếp qua nơi gọi (giống `listWebhooks`/`createWebhook`, không test trực tiếp fetch — đúng quy ước file).
- `formatScheduleAsBusinessHours`: test thuần (input schedule → output string đúng format).
- UI: kiểm chứng thủ công (không tự động test được UI trong vitest, đúng giới hạn đã gặp ở card webhook).

## 6. Ngoài phạm vi

- Date overrides, nhiều khung giờ/ngày, nhiều schedule — chủ tiệm tự vào Cal.com nếu cần nâng cao.
- Gắn schedule theo từng event type riêng (`scheduleId` trên event type) — chỉ dùng lịch mặc định của tài khoản.
- Sửa `about`/`services_summary` UI — giữ nguyên, không thuộc phạm vi này.

---

Sources:
- [Create a schedule - Cal.com Docs](https://cal.com/docs/api-reference/v2/schedules/create-a-schedule)
- [Get a schedule - Cal.com Docs](https://cal.com/docs/api-reference/v2/schedules/get-a-schedule)
