-- Portal access control: each staff member gets a preset role (admin / qa /
-- sales / production) whose default module permissions can be overridden
-- per user (granted or denied) from the admin panel. Enforced server-side by
-- src/middleware.ts; this table data is only ever written via the service-role
-- client. NULL portal_role = no module access (fail closed).
--
-- Separate from staff.ops_role, which is the Atelier module's own in-module
-- authorization (RLS helpers) and is deliberately left alone.

alter table staff
  add column portal_role text check (portal_role in ('admin', 'qa', 'sales', 'production')),
  add column portal_permission_overrides jsonb not null default '{}'::jsonb;

update staff set portal_role = 'admin'      where email = 'meissam@oaziz.ca';
update staff set portal_role = 'qa'         where email in ('jacobp@oaziz.ca', 'stephane@oaziz.ca');
update staff set portal_role = 'sales'      where email in ('kyle@oaziz.ca', 'jorge@oaziz.ca');
update staff set portal_role = 'production' where email = 'simon@oaziz.ca';
