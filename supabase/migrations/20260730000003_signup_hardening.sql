-- Signup hardening.
--
-- 1. Extract starter copy into seed_workspace_starters() so handle_new_user()
--    stops being a ~120-line copy-paste. It had been redefined in full five
--    times (init_schema, 000004, 000007, 000008, 20260730000001) and two of
--    those copies had already drifted apart.
--    KEEP IN SYNC with lib/workspace-ai-defaults.ts + lib/workspace-faq-defaults.ts.
-- 2. Fix the slug allocation race: the old code ran `while exists (...)` and
--    then INSERTed in a separate statement (TOCTOU). Two concurrent signups
--    sharing a base slug could both pass the check, and the loser hit
--    workspaces_slug_unique -> unique_violation -> the whole auth.users insert
--    rolled back, i.e. a failed signup with no retry.
-- 3. Stop granting anon DML on future tables by default.

-- -----------------------------------------------------------------------------
-- seed_workspace_starters — fills blank AI/chat fields + starter FAQ
-- -----------------------------------------------------------------------------
-- Blank-filling (not overwriting) so it is safe to call more than once.

create or replace function public.seed_workspace_starters(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours constant text :=
    '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' ||
    '- Chủ nhật: 08:00–12:00' || E'\n' ||
    '- Nghỉ các ngày lễ lớn';
begin
  update public.workspaces
  set
    tagline = coalesce(
      nullif(trim(tagline), ''),
      'Trợ lý đặt lịch 24/7 cho tiệm / studio / coaching'
    ),
    about = coalesce(
      nullif(trim(about), ''),
      'Chúng tôi hỗ trợ khách hỏi FAQ, xem lịch trống và đặt hẹn qua chat AI. Chi tiết dịch vụ / giá xác nhận khi đặt lịch.'
    ),
    business_hours = coalesce(nullif(trim(business_hours), ''), v_hours),
    services_summary = coalesce(
      nullif(trim(services_summary), ''),
      '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.' || E'\n' ||
      '- Dịch vụ dài hơn / cần lịch riêng — nhân viên xếp lịch'
    ),
    agent_instructions = coalesce(
      nullif(trim(agent_instructions), ''),
      '- Xưng hô lịch sự, ưu tiên slot sớm nếu khách gấp.' || E'\n' ||
      '- Không cam kết giá cuối nếu chưa xác nhận.' || E'\n' ||
      '- Nếu ngoài phạm vi booking: đề nghị gọi SĐT workspace.'
    ),
    agent_display_name = coalesce(nullif(trim(agent_display_name), ''), 'Trợ lý đặt lịch'),
    agent_tone = coalesce(agent_tone, 'friendly'),
    agent_reply_locale = coalesce(agent_reply_locale, 'vi'),
    agent_handoff = coalesce(
      nullif(trim(agent_handoff), ''),
      'Nếu khách cần việc ngoài FAQ / đặt lịch: đề nghị gọi SĐT hoặc email workspace. Không hứa kết quả chưa xác nhận được.'
    ),
    chat_assistant_label = coalesce(
      nullif(trim(chat_assistant_label), ''),
      'Trợ lý đặt lịch AI'
    ),
    chat_intro = coalesce(
      nullif(trim(chat_intro), ''),
      'Hỏi FAQ, xem lịch trống, hoặc đặt hẹn ngay.'
    ),
    chat_placeholder = coalesce(
      nullif(trim(chat_placeholder), ''),
      'Hỏi giờ mở cửa, dịch vụ, hoặc đặt lịch…'
    ),
    chat_suggestions = case
      when chat_suggestions is null
        or jsonb_typeof(chat_suggestions) <> 'array'
        or jsonb_array_length(chat_suggestions) = 0
      then jsonb_build_array(
        jsonb_build_object('label', 'Chiều mai', 'prompt', 'Chiều mai còn chỗ trống không?'),
        jsonb_build_object('label', 'Giờ mở cửa', 'prompt', 'Hôm nay mở cửa lúc mấy giờ?'),
        jsonb_build_object('label', 'Đặt lịch', 'prompt', 'Tôi muốn đặt một lịch hẹn'),
        jsonb_build_object('label', 'Dịch vụ', 'prompt', 'Các bạn có những dịch vụ nào?')
      )
      else chat_suggestions
    end,
    updated_at = now()
  where id = p_workspace_id;

  if not exists (
    select 1 from public.workspace_faq_items where workspace_id = p_workspace_id
  ) then
    insert into public.workspace_faq_items (workspace_id, question, answer, sort_order)
    values
      (p_workspace_id, 'Giờ mở cửa?', v_hours, 0),
      (
        p_workspace_id,
        'Có những dịch vụ nào?',
        '- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.' || E'\n' ||
        '- Dịch vụ dài hơn — nhân viên xếp lịch trên Cal.com',
        1
      ),
      (
        p_workspace_id,
        'Giá tham khảo như thế nào?',
        '- Tư vấn: theo bảng giá workspace' || E'\n' ||
        '- Không cam kết giá cuối qua chat nếu chưa xác nhận',
        2
      ),
      (
        p_workspace_id,
        'Đặt lịch như thế nào?',
        '- Đặt qua chat; lịch ghi vào calendar' || E'\n' ||
        '- Đến trước giờ hẹn 10–15 phút',
        3
      ),
      (
        p_workspace_id,
        'Hủy hoặc đổi lịch thế nào?',
        '- Báo hủy/đổi trước ít nhất 4 giờ' || E'\n' ||
        '- Liên hệ SĐT workspace nếu gấp' || E'\n' ||
        '- Có thể nhắn trong chat để được hỗ trợ',
        4
      );
  end if;
end;
$$;

comment on function public.seed_workspace_starters(uuid) is
  'Fills blank AI/chat profile fields + starter FAQ for a workspace. Idempotent. KEEP IN SYNC with lib/workspace-ai-defaults.ts + lib/workspace-faq-defaults.ts.';

revoke all on function public.seed_workspace_starters(uuid)
  from public, anon, authenticated;
grant execute on function public.seed_workspace_starters(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- handle_new_user — race-safe slug allocation, starters delegated
-- -----------------------------------------------------------------------------

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

  -- Invite path: join an existing workspace as staff, create no workspace.
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

  -- Owner path: create a workspace.
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

  -- Let the unique index decide, instead of checking then inserting. The
  -- BEGIN/EXCEPTION block is a subtransaction: a losing INSERT rolls back to
  -- the savepoint and the loop retries with the next suffix.
  -- workspaces has exactly one unique constraint besides the PK
  -- (workspaces_slug_unique), so unique_violation here means "slug taken".
  loop
    begin
      insert into public.workspaces (name, slug, timezone)
      values (ws_name, final_slug, 'Asia/Ho_Chi_Minh')
      returning id into ws_id;
      exit;
    exception when unique_violation then
      n := n + 1;
      if n > 50 then
        raise exception 'Could not allocate a workspace slug for "%"', base_slug;
      end if;
      final_slug := left(base_slug, 40) || '-' || n::text;
    end;
  end loop;

  perform public.seed_workspace_starters(ws_id);

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
  'Invite token → staff joins existing workspace; else create an owner workspace (race-safe slug) and call seed_workspace_starters().';

-- -----------------------------------------------------------------------------
-- Default privileges: stop auto-granting anon DML on future tables
-- -----------------------------------------------------------------------------
-- init_schema.sql:481-483 set anon as a default grantee for every table created
-- afterwards in `public`. All 15 tables today enable RLS, so nothing is exposed
-- right now — but any future migration that forgets `enable row level security`
-- would be world-writable by anon with no second line of defence.
--
-- Existing per-table grants are intentionally left alone: revoking those is a
-- runtime behaviour change (anon would get `permission denied` instead of an
-- RLS-empty result) and belongs in its own migration.

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;
