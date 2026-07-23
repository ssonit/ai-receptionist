-- Replace 1:1 workspace_faq sections with 1:N FAQ Q&A items

create table public.workspace_faq_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspace_faq_items_workspace_sort
  on public.workspace_faq_items (workspace_id, sort_order);

create trigger workspace_faq_items_updated_at
before update on public.workspace_faq_items
for each row
execute function public.handle_updated_at();

-- Migrate existing section columns into Q&A rows (if old table still present)
do $$
begin
  if to_regclass('public.workspace_faq') is not null then
    insert into public.workspace_faq_items (workspace_id, question, answer, sort_order)
    select workspace_id, q.question, q.answer, q.sort_order
    from public.workspace_faq wf
    cross join lateral (
      values
        (0, 'Giờ mở cửa', wf.opening_hours),
        (1, 'Dịch vụ phổ biến', wf.services),
        (2, 'Giá (tham khảo)', wf.pricing),
        (3, 'Đặt lịch', wf.preparation),
        (4, 'Hủy / đổi lịch', wf.cancel_policy),
        (5, 'Thêm', wf.extra)
    ) as q(sort_order, question, answer)
    where q.answer is not null and btrim(q.answer) <> '';
  end if;
end $$;

drop policy if exists "Authenticated can read workspace faq (pilot)" on public.workspace_faq;
drop policy if exists "Users can insert workspace faq" on public.workspace_faq;
drop policy if exists "Users can update workspace faq" on public.workspace_faq;

drop table if exists public.workspace_faq;

alter table public.workspace_faq_items enable row level security;

create policy "Authenticated can read workspace faq items (pilot)"
on public.workspace_faq_items
for select
to authenticated
using (true);

create policy "Users can insert workspace faq items"
on public.workspace_faq_items
for insert
to authenticated
with check (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can update workspace faq items"
on public.workspace_faq_items
for update
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
)
with check (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

create policy "Users can delete workspace faq items"
on public.workspace_faq_items
for delete
to authenticated
using (
  workspace_id in (select workspace_id from public.profiles where id = auth.uid())
);

comment on table public.workspace_faq_items is 'Booking chat FAQ Q&A items per workspace';
comment on column public.workspace_faq_items.question is 'FAQ question shown to agent';
comment on column public.workspace_faq_items.answer is 'FAQ answer (markdown allowed)';
comment on column public.workspace_faq_items.sort_order is 'Display order within workspace (ascending)';
