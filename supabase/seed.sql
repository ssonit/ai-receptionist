-- Pilot workspace + FAQ (re-applied on every `npx supabase db reset`)

insert into public.workspaces (id, name, timezone, phone, address)
values (
  '00000000-0000-4000-8000-000000000001',
  'Eve Pilot',
  'Asia/Ho_Chi_Minh',
  '0901234567',
  '123 Nguyễn Huệ, Quận 1, TP.HCM'
)
on conflict (id) do update set
  name = excluded.name,
  timezone = excluded.timezone,
  phone = excluded.phone,
  address = excluded.address,
  updated_at = now();

insert into public.workspace_faq (
  workspace_id,
  opening_hours,
  services,
  pricing,
  preparation,
  cancel_policy,
  extra
)
values (
  '00000000-0000-4000-8000-000000000001',
  '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' || '- Chủ nhật: 08:00–12:00' || E'\n' || '- Nghỉ các ngày lễ lớn',
  '- Tư vấn / consultation (30 phút) — đặt qua chat' || E'\n' || '- Điều trị dài — nhân viên xếp lịch trên Cal.com',
  '- Tư vấn: theo bảng giá workspace' || E'\n' || '- Không cam kết giá cuối qua chat nếu chưa xác nhận',
  '- Đặt qua chat; lịch ghi vào calendar' || E'\n' || '- Đến trước giờ hẹn 10–15 phút',
  '- Báo hủy/đổi trước ít nhất 4 giờ' || E'\n' || '- Liên hệ SĐT workspace nếu gấp',
  null
)
on conflict (workspace_id) do update set
  opening_hours = excluded.opening_hours,
  services = excluded.services,
  pricing = excluded.pricing,
  preparation = excluded.preparation,
  cancel_policy = excluded.cancel_policy,
  extra = excluded.extra,
  updated_at = now();
