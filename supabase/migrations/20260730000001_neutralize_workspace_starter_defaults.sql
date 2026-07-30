-- Neutralize clinic-biased starter copy (tagline / services / FAQ).
-- KEEP handle_new_user AI/FAQ defaults in sync with:
--   lib/workspace-ai-defaults.ts
--   lib/workspace-faq-defaults.ts

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
  base_slug text;
  final_slug text;
  ws_name text;
  n int := 0;
  invite_token text;
  inv public.workspace_invites%rowtype;
  profile_role text;
begin
  invite_token := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '');

  if invite_token is not null then
    select * into inv
    from public.workspace_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'Invalid or expired invite token';
    end if;

    if inv.email is not null
       and lower(trim(inv.email)) <> lower(trim(coalesce(new.email, ''))) then
      raise exception 'Invite email does not match signup email';
    end if;

    insert into public.profiles (id, email, full_name, role, workspace_id)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      inv.role,
      inv.workspace_id
    );

    update public.workspace_invites
    set accepted_at = now()
    where id = inv.id;

    return new;
  end if;

  -- Owner path: create workspace + starter defaults
  ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'workspace_name', '')), '');
  if ws_name is null then
    ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  end if;
  if ws_name is null then
    ws_name := split_part(coalesce(new.email, 'workspace'), '@', 1);
  end if;
  if ws_name is null or length(ws_name) < 1 then
    ws_name := 'Workspace';
  end if;

  base_slug := public.slugify_workspace_name(ws_name);
  final_slug := base_slug;

  while exists (select 1 from public.workspaces where slug = final_slug) loop
    n := n + 1;
    final_slug := left(base_slug, 40) || '-' || n::text;
  end loop;

  insert into public.workspaces (
    name,
    slug,
    timezone,
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
    chat_suggestions
  )
  values (
    ws_name,
    final_slug,
    'Asia/Ho_Chi_Minh',
    'Trợ lý đặt lịch 24/7 cho tiệm / studio / coaching',
    'Chúng tôi hỗ trợ khách hỏi FAQ, xem lịch trống và đặt hẹn qua chat AI. Chi tiết dịch vụ / giá xác nhận khi đặt lịch.',
    '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' || '- Chủ nhật: 08:00–12:00' || E'\n' || '- Nghỉ các ngày lễ lớn',
    '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.' || E'\n' || '- Dịch vụ dài hơn / cần lịch riêng — nhân viên xếp lịch',
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
    )
  )
  returning id into ws_id;

  insert into public.workspace_faq_items (workspace_id, question, answer, sort_order)
  values
    (
      ws_id,
      'Giờ mở cửa?',
      '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' || '- Chủ nhật: 08:00–12:00' || E'\n' || '- Nghỉ các ngày lễ lớn',
      0
    ),
    (
      ws_id,
      'Có những dịch vụ nào?',
      '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.' || E'\n' || '- Dịch vụ dài hơn — nhân viên xếp lịch trên Cal.com',
      1
    ),
    (
      ws_id,
      'Giá tham khảo như thế nào?',
      '- Tư vấn: theo bảng giá workspace' || E'\n' || '- Không cam kết giá cuối qua chat nếu chưa xác nhận',
      2
    ),
    (
      ws_id,
      'Đặt lịch như thế nào?',
      '- Đặt qua chat; lịch ghi vào calendar' || E'\n' || '- Đến trước giờ hẹn 10–15 phút',
      3
    ),
    (
      ws_id,
      'Hủy hoặc đổi lịch thế nào?',
      '- Báo hủy/đổi trước ít nhất 4 giờ' || E'\n' || '- Liên hệ SĐT workspace nếu gấp' || E'\n' || '- Có thể nhắn trong chat để được hỗ trợ',
      4
    );

  profile_role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'owner');
  if profile_role not in ('owner', 'staff') then
    profile_role := 'owner';
  end if;

  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    profile_role,
    ws_id
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Invite token → staff join existing workspace; else create owner workspace with AI/chat/FAQ starters. KEEP IN SYNC with lib/workspace-ai-defaults.ts + lib/workspace-faq-defaults.ts.';

-- Exact-match backfill: only rows still on the old clinic starter strings.
update public.workspaces
set
  tagline = 'Trợ lý đặt lịch 24/7 cho tiệm / studio / coaching',
  updated_at = now()
where tagline = 'Trợ lý đặt lịch 24/7 cho phòng khám / studio';

update public.workspaces
set
  services_summary =
    '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.'
    || E'\n'
    || '- Dịch vụ dài hơn / cần lịch riêng — nhân viên xếp lịch',
  updated_at = now()
where services_summary in (
  '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.'
    || E'\n'
    || '- Khám / điều trị dài hơn — nhân viên xếp lịch',
  '- Consultation 30 phút (đặt qua chat)'
    || E'\n'
    || '- Khám / điều trị dài hơn — nhân viên xếp lịch'
);

update public.workspace_faq_items
set answer =
  '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.'
  || E'\n'
  || '- Dịch vụ dài hơn — nhân viên xếp lịch trên Cal.com'
where question = 'Có những dịch vụ nào?'
  and answer in (
    '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.'
      || E'\n'
      || '- Điều trị dài — nhân viên xếp lịch trên Cal.com',
    '- Tư vấn / consultation (30 phút) — đặt qua chat'
      || E'\n'
      || '- Điều trị dài — nhân viên xếp lịch trên Cal.com'
  );
