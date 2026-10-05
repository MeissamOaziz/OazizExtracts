-- QuickBooks Online link for the payables module.
--
-- Portal → QB: each invoice becomes a Bill (PDF attached); each payment ticked
-- "Payé" becomes a BillPayment against those bills, so the remittance can be
-- sent from QB right away. QB → portal: bills and bill payments entered
-- directly in QB are pulled in, and vendor balances are compared nightly.
-- Every synced row keeps the QB id, so nothing is ever created twice.

-- One row: the connected QB company. Tokens are AES-GCM encrypted by the app
-- (QBO_TOKEN_KEY), and the table is service-role only like every ap_* table.
create table qbo_connection (
  id int primary key default 1 check (id = 1),
  environment text not null check (environment in ('sandbox', 'production')),
  realm_id text not null,
  company_name text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  connected_by uuid references staff(id),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_status text,
  last_pull_cursor timestamptz
);

create table qbo_sync_log (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('push', 'pull', 'system')),
  entity text not null,
  portal_id uuid,
  qbo_id text,
  status text not null check (status in ('ok', 'skipped', 'error', 'warning')),
  message text,
  created_at timestamptz not null default now()
);
create index qbo_sync_log_created_idx on qbo_sync_log (created_at desc);

alter table ap_suppliers
  add column qbo_vendor_id text unique,
  add column qbo_expense_account_id text,
  add column qbo_tax_code_id text;

alter table ap_bank_accounts add column qbo_account_id text;

alter table ap_invoices
  add column subtotal numeric(14,2),
  add column tax_gst numeric(14,2),
  add column tax_qst numeric(14,2),
  add column qbo_bill_id text unique,
  add column qbo_synced_at timestamptz,
  add column qbo_error text;

alter table ap_payments
  add column qbo_billpayment_id text unique,
  add column qbo_synced_at timestamptz,
  add column qbo_error text;

alter table ap_invoices drop constraint ap_invoices_source_check;
alter table ap_invoices add constraint ap_invoices_source_check check (source in ('portal', 'import', 'qbo'));
alter table ap_payments drop constraint ap_payments_source_check;
alter table ap_payments add constraint ap_payments_source_check check (source in ('portal', 'import', 'qbo'));

insert into ap_settings (key, value) values
  ('qbo_defaults', '{"expense_account_id": null, "tax_code_id": null, "push_bills": true, "push_payments": true, "pull": true}'::jsonb)
on conflict (key) do nothing;

alter table qbo_connection enable row level security;
alter table qbo_sync_log enable row level security;

-- ap_invoice_balances was created with `select i.*`, which Postgres expands at
-- creation time: recreate both views so the new columns are exposed.
drop view ap_supplier_balances;
drop view ap_invoice_balances;

create view ap_invoice_balances with (security_invoker = on) as
select i.*,
  coalesce(a.allocated, 0)::numeric(14,2) as allocated,
  (i.amount - coalesce(a.allocated, 0))::numeric(14,2) as open_amount
from ap_invoices i
left join (
  select al.invoice_id, sum(al.amount) as allocated
  from ap_payment_allocations al
  join ap_payments p on p.id = al.payment_id and p.voided_at is null
  group by al.invoice_id
) a on a.invoice_id = i.id
where i.voided_at is null;

create view ap_supplier_balances with (security_invoker = on) as
select s.id as supplier_id,
  coalesce(sum(b.open_amount), 0)::numeric(14,2) as owed,
  coalesce(sum(b.open_amount) filter (where b.due_date < current_date and b.open_amount > 0), 0)::numeric(14,2) as overdue,
  coalesce(sum(b.open_amount) filter (where b.open_amount > 0 and (b.due_date is null or b.due_date <= current_date + 7)), 0)::numeric(14,2) as due_7d,
  count(b.id) filter (where b.open_amount <> 0) as open_count,
  count(b.id) filter (where not b.in_quickbooks and b.source = 'portal') as not_in_qbo,
  (select max(p.paid_on) from ap_payments p where p.supplier_id = s.id and p.voided_at is null) as last_paid_on
from ap_suppliers s
left join ap_invoice_balances b on b.supplier_id = s.id
group by s.id;

revoke all on ap_invoice_balances, ap_supplier_balances from anon, authenticated;
