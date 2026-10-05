-- QuickBooks coding chosen per invoice at review time (expense account + tax
-- code). Suggested from how the supplier's previous QB bills were coded; an
-- invoice with no coding waits in "Factures à classer" instead of being pushed.
alter table ap_invoices add column qbo_account_id text, add column qbo_tax_code_id text;

-- Recreate the balance views so they expose the new columns (select i.* is
-- expanded when a view is created).
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
