-- Workspace staff invites + signup/login join path.
-- KEEP handle_new_user AI/FAQ defaults in sync with:
--   lib/workspace-ai-defaults.ts
--   lib/workspace-faq-defaults.ts
--   20260724000007_workspace_starter_defaults.sql

-- -----------------------------------------------------------------------------
-- workspace_invites
-- -----------------------------------------------------------------------------

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text,
  token text not null unique,
  role text not null default 'staff' check (role in ('staff')),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_invites_workspace_idx
  on public.workspace_invites (workspace_id, created_at desc);

create index workspace_invites_pending_token_idx
  on public.workspace_invites (token)
  where accepted_at is null;

comment on table public.workspace_invites is
  'Owner-created invite links; signup with invite_token joins workspace as staff (no new workspace).';

alter table public.workspace_invites enable row level security;

grant select, insert, delete on public.workspace_invites to authenticated;
grant all on public.workspace_invites to service_role;

-- Avoid RLS recursion when policies read profiles
create or replace function public.current_user_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_is_workspace_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and workspace_id is not null
  )
$$;

grant execute on function public.current_user_workspace_id() to authenticated, service_role;
grant execute on function public.current_user_is_workspace_owner() to authenticated, service_role;

-- Owner-only invite management
create policy "Owners can read workspace invites"
on public.workspace_invites for select to authenticated
using (
  public.current_user_is_workspace_owner()
  and workspace_id = public.current_user_workspace_id()
);

create policy "Owners can create workspace invites"
on public.workspace_invites for insert to authenticated
with check (
  public.current_user_is_workspace_owner()
  and workspace_id = public.current_user_workspace_id()
  and invited_by = auth.uid()
);

create policy "Owners can delete workspace invites"
on public.workspace_invites for delete to authenticated
using (
  public.current_user_is_workspace_owner()
  and workspace_id = public.current_user_workspace_id()
);

-- Teammates can see each other (Settings → Team)
create policy "Users can view workspace teammates"
on public.profiles for select to authenticated
using (
  workspace_id is not null
  and workspace_id = public.current_user_workspace_id()
);

-- -----------------------------------------------------------------------------
-- Preview invite (anon + authenticated) — no secrets beyond workspace name
-- -----------------------------------------------------------------------------

create or replace function public.get_workspace_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  ws_name text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into inv
  from public.workspace_invites
  where token = trim(p_token)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select name into ws_name from public.workspaces where id = inv.workspace_id;

  return jsonb_build_object(
    'ok', true,
    'workspaceName', coalesce(ws_name, 'Workspace'),
    'email', inv.email,
    'role', inv.role,
    'expiresAt', inv.expires_at
  );
end;
$$;

grant execute on function public.get_workspace_invite_preview(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Accept invite (logged-in user)
-- -----------------------------------------------------------------------------

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  uid uuid := auth.uid();
  user_email text;
  old_ws uuid;
  old_setup timestamptz;
  has_data boolean;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into inv
  from public.workspace_invites
  where token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select email into user_email from auth.users where id = uid;
  if inv.email is not null
     and lower(trim(inv.email)) <> lower(trim(coalesce(user_email, ''))) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select workspace_id into old_ws from public.profiles where id = uid;

  if old_ws is not null and old_ws = inv.workspace_id then
    update public.workspace_invites
    set accepted_at = now()
    where id = inv.id and accepted_at is null;

    update public.profiles
    set role = inv.role, updated_at = now()
    where id = uid;

    return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id, 'alreadyMember', true);
  end if;

  if old_ws is not null then
    select setup_completed_at into old_setup
    from public.workspaces
    where id = old_ws;

    if old_setup is not null then
      return jsonb_build_object('ok', false, 'error', 'already_in_workspace');
    end if;

    -- Orphan incomplete workspace: only delete if empty of customer data
    select
      exists (select 1 from public.bookings where workspace_id = old_ws)
      or exists (select 1 from public.leads where workspace_id = old_ws)
    into has_data;

    if has_data then
      return jsonb_build_object('ok', false, 'error', 'already_in_workspace');
    end if;

    delete from public.workspaces where id = old_ws;
  end if;

  update public.profiles
  set
    workspace_id = inv.workspace_id,
    role = inv.role,
    updated_at = now()
  where id = uid;

  update public.workspace_invites
  set accepted_at = now()
  where id = inv.id;

  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id);
end;
$$;

grant execute on function public.accept_workspace_invite(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- handle_new_user: invite_token → join as staff; else create workspace (owner)
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
    'Trợ lý đặt lịch 24/7 cho phòng khám / studio',
    'Chúng tôi hỗ trợ khách hỏi FAQ, xem lịch trống và đặt hẹn qua chat AI. Chi tiết dịch vụ / giá xác nhận khi đặt lịch.',
    '- Thứ 2–Thứ 7: 08:00–20:00' || E'\n' || '- Chủ nhật: 08:00–12:00' || E'\n' || '- Nghỉ các ngày lễ lớn',
    '- Consultation 30 phút (đặt qua chat)' || E'\n' || '- Khám / điều trị dài hơn — nhân viên xếp lịch',
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
      '- Tư vấn / consultation (30 phút) — đặt qua chat' || E'\n' || '- Điều trị dài — nhân viên xếp lịch trên Cal.com',
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
