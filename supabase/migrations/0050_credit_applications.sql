-- Credits (credit notes, overpayments, negative adjustments) are applied
-- against the same supplier's open invoices, so a credit and the invoice it
-- offsets both close instead of showing as two open items. Balances don't
-- change (they already netted); open counts and overdue amounts become right.

create table ap_credit_applications (
  id uuid primary key default gen_random_uuid(),
  credit_invoice_id uuid not null references ap_invoices(id) on delete cascade,
  invoice_id uuid not null references ap_invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index ap_credit_app_credit_idx on ap_credit_applications (credit_invoice_id);
create index ap_credit_app_invoice_idx on ap_credit_applications (invoice_id);
alter table ap_credit_applications enable row level security;

drop view ap_supplier_balances;
drop view ap_invoice_balances;

-- open = amount − payments − credits applied to it + credit used (for credits).
-- Applications whose other side is voided are ignored, so voiding frees them.
create view ap_invoice_balances with (security_invoker = on) as
select i.*,
  (coalesce(a.paid, 0) + coalesce(ci.applied_in, 0) - coalesce(co.applied_out, 0))::numeric(14,2) as allocated,
  (i.amount - coalesce(a.paid, 0) - coalesce(ci.applied_in, 0) + coalesce(co.applied_out, 0))::numeric(14,2) as open_amount
from ap_invoices i
left join (
  select al.invoice_id, sum(al.amount) as paid
  from ap_payment_allocations al
  join ap_payments p on p.id = al.payment_id and p.voided_at is null
  group by al.invoice_id
) a on a.invoice_id = i.id
left join (
  select ca.invoice_id, sum(ca.amount) as applied_in
  from ap_credit_applications ca
  join ap_invoices c on c.id = ca.credit_invoice_id and c.voided_at is null
  group by ca.invoice_id
) ci on ci.invoice_id = i.id
left join (
  select ca.credit_invoice_id, sum(ca.amount) as applied_out
  from ap_credit_applications ca
  join ap_invoices t on t.id = ca.invoice_id and t.voided_at is null
  group by ca.credit_invoice_id
) co on co.credit_invoice_id = i.id
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

-- Apply every open credit of a supplier to its open invoices: same invoice
-- number first, then oldest due/invoice date.
create or replace function ap_apply_credits(p_supplier_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  c record; i record; v_left numeric; v_take numeric;
begin
  for c in
    select id, invoice_number, -open_amount as avail from ap_invoice_balances
    where supplier_id = p_supplier_id and open_amount < 0
    order by coalesce(invoice_date, created_at::date), created_at
  loop
    v_left := c.avail;
    for i in
      select id, open_amount from ap_invoice_balances
      where supplier_id = p_supplier_id and open_amount > 0
      order by (invoice_number is not null and invoice_number = c.invoice_number) desc,
               coalesce(due_date, invoice_date, created_at::date), created_at
    loop
      exit when v_left <= 0;
      v_take := least(v_left, i.open_amount);
      insert into ap_credit_applications (credit_invoice_id, invoice_id, amount) values (c.id, i.id, v_take);
      v_left := v_left - v_take;
    end loop;
  end loop;
end $$;
revoke all on function ap_apply_credits(uuid) from public, anon, authenticated;
grant execute on function ap_apply_credits(uuid) to service_role;

-- New invoices or credits trigger the matching automatically.
create or replace function ap_invoices_apply_credits_trg() returns trigger
language plpgsql set search_path = public as $$
begin
  perform ap_apply_credits(new.supplier_id);
  return null;
end $$;
create trigger ap_invoices_apply_credits after insert on ap_invoices
for each row when (new.voided_at is null) execute function ap_invoices_apply_credits_trg();

-- One-time pass over existing data (e.g. imported credit notes).
select ap_apply_credits(id) from ap_suppliers;
