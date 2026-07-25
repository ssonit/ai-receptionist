-- Clear guest_timezone on onsite workspaces (was recorded incorrectly before gate).
-- Read-path still ignores stored guest_timezone when service_mode = onsite.

update public.bookings b
set guest_timezone = null
from public.workspaces w
where b.workspace_id = w.id
  and coalesce(w.service_mode, 'onsite') = 'onsite'
  and b.guest_timezone is not null;
