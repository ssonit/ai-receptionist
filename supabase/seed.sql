-- =============================================================================
-- Local / demo seed ONLY — not for production schema
-- =============================================================================
-- Applied automatically after migrations on `npx supabase db reset`
-- (see supabase/config.toml [db.seed]).
--
-- This is the canonical place for:
--   • Eve Pilot workspace (id + slug eve-pilot) — marketing sandbox for `/chat`
--   • Demo FAQ Q&A for that workspace
--
-- Ops: Eve Pilot Cal.com comes from env CALCOM_API_KEY (+ EVENT_TYPE / USERNAME)
-- for the marketing `/chat` demo — use a sandbox calendar, not a customer one.
-- Real workspaces paste their own API key in Setup (encrypted on workspaces row).
--
-- Production / multi-tenant signup creates a new empty workspace via
-- handle_new_user() — it does NOT attach users to this pilot row.
-- Real tenant public pages: `/b/{slug}` (not `/chat`).
--
-- Fresh clean-slate path: apply supabase/baseline/001_schema.sql, then this file.
-- Active local/prod path: supabase/migrations/* then this file.
-- =============================================================================

-- Pilot workspace + FAQ items (re-applied on every `npx supabase db reset`)

insert into public.workspaces (
  id,
  name,
  slug,
  timezone,
  phone,
  address,
  email,
  website,
  tagline,
  about,
  business_hours,
  services_summary,
  agent_instructions,
  agent_display_name,
  agent_tone,
  agent_reply_locale,
  agent_handoff,
  chat_assistant_label,
  chat_intro,
  chat_placeholder,
  chat_suggestions,
  setup_completed_at
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Eve Pilot',
  'eve-pilot',
  'Asia/Ho_Chi_Minh',
  '0901234567',
  '123 Nguyễn Huệ, Quận 1, TP.HCM',
  'hello@evepilot.local',
  'https://eve.dev',
  'Trợ lý đặt lịch 24/7 cho phòng khám / studio',
  'Eve Pilot là workspace demo: chat AI giúp khách hỏi FAQ, chọn slot và đặt lịch thật qua Cal.com.',
  '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' || '- Chủ nhật: 08:00–12:00' || E'\n' || '- Nghỉ các ngày lễ lớn',
  '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.' || E'\n' || '- Khám / điều trị dài hơn — nhân viên xếp lịch',
  '- Xưng hô lịch sự, ưu tiên slot sớm nếu khách gấp.' || E'\n' || '- Không cam kết giá cuối nếu chưa xác nhận.' || E'\n' || '- Nếu ngoài phạm vi booking: đề nghị gọi SĐT workspace.',
  'Trợ lý đặt lịch',
  'friendly',
  'vi',
  'Nếu khách cần việc ngoài FAQ / đặt lịch: đề nghị gọi SĐT hoặc email workspace. Không hứa kết quả chưa xác nhận được.',
  'Trợ lý đặt lịch AI',
  'Hỏi FAQ, xem lịch trống, hoặc đặt hẹn ngay.',
  'Hỏi giờ mở cửa, dịch vụ, hoặc đặt lịch…',
  jsonb_build_array(
    jsonb_build_object('label', 'Chiều mai', 'prompt', 'Chiều mai còn chỗ trống không?'),
    jsonb_build_object('label', 'Giờ mở cửa', 'prompt', 'Hôm nay mở cửa lúc mấy giờ?'),
    jsonb_build_object('label', 'Đặt lịch', 'prompt', 'Tôi muốn đặt một lịch hẹn'),
    jsonb_build_object('label', 'Dịch vụ', 'prompt', 'Các bạn có những dịch vụ nào?')
  ),
  now()
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  timezone = excluded.timezone,
  phone = excluded.phone,
  address = excluded.address,
  email = excluded.email,
  website = excluded.website,
  tagline = excluded.tagline,
  about = excluded.about,
  business_hours = excluded.business_hours,
  services_summary = excluded.services_summary,
  agent_instructions = excluded.agent_instructions,
  agent_display_name = excluded.agent_display_name,
  agent_tone = excluded.agent_tone,
  agent_reply_locale = excluded.agent_reply_locale,
  agent_handoff = excluded.agent_handoff,
  chat_assistant_label = excluded.chat_assistant_label,
  chat_intro = excluded.chat_intro,
  chat_placeholder = excluded.chat_placeholder,
  chat_suggestions = excluded.chat_suggestions,
  setup_completed_at = coalesce(public.workspaces.setup_completed_at, excluded.setup_completed_at),
  updated_at = now();

delete from public.workspace_faq_items
where workspace_id = '00000000-0000-4000-8000-000000000001';

insert into public.workspace_faq_items (workspace_id, question, answer, sort_order)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'Giờ mở cửa?',
    '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' || '- Chủ nhật: 08:00–12:00' || E'\n' || '- Nghỉ các ngày lễ lớn',
    0
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'Có những dịch vụ nào?',
    '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.' || E'\n' || '- Điều trị dài — nhân viên xếp lịch trên Cal.com',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'Giá tham khảo như thế nào?',
    '- Tư vấn: theo bảng giá workspace' || E'\n' || '- Không cam kết giá cuối qua chat nếu chưa xác nhận',
    2
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'Đặt lịch như thế nào?',
    '- Đặt qua chat; lịch ghi vào calendar' || E'\n' || '- Đến trước giờ hẹn 10–15 phút',
    3
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'Hủy hoặc đổi lịch thế nào?',
    '- Báo hủy/đổi trước ít nhất 4 giờ' || E'\n' || '- Liên hệ SĐT workspace nếu gấp',
    4
  );
