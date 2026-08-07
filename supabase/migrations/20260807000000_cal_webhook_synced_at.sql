-- Cổng rẻ cho việc tự đăng ký lại webhook Cal.com: NULL nghĩa là
-- "ensureCalWebhookForWorkspace() còn cần chạy", set lúc thành công (đăng ký
-- mới hoặc đã có sẵn) để các lần gọi sau bỏ qua round-trip listWebhooks.
alter table public.workspaces
  add column if not exists cal_webhook_synced_at timestamptz;

comment on column public.workspaces.cal_webhook_synced_at is
  'Last time ensureCalWebhookForWorkspace() confirmed the Cal.com webhook is registered. NULL = needs (re)registration.';
