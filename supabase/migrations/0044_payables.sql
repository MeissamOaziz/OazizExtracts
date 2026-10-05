-- Comptes à payer / Payables: replaces the "Supplier Payments" workbook.
--
-- One row per supplier, their invoices and payments (the per-supplier tabs),
-- and a weekly payment run (the "Supplier payment summary" tab): bank balances
-- and fixed outflows, the amount Meissam/Nathalie suggest per supplier, the
-- amount Jorge approves through an emailed token link, then "paid" and
-- "remittance sent" ticks while the payments are processed.
--
-- Balances are never stored: an invoice's open amount = amount - allocations,
-- a supplier's balance = sum of open amounts (credits are negative invoices).
-- Payments are allocated to invoices oldest-first by ap_record_payment().
--
-- Finance data: RLS enabled with zero policies, so only the service-role
-- client (server routes, behind the 'payables' permission) can touch it.

create table ap_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order int not null default 0
);

insert into ap_bank_accounts (code, name, sort_order) values
  ('rbc', 'RBC Oaziz', 1),
  ('td_mjlb', 'TD MJLB Consultants', 2);

create table ap_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  category text not null default 'supplier'
    check (category in ('supplier', 'service', 'loan', 'tax', 'utility', 'rent', 'employee', 'other')),
  payment_method text not null default 'eft'
    check (payment_method in ('eft', 'wire', 'etransfer', 'prepaid_cc', 'cheque', 'auto_withdrawal', 'other')),
  bank_account_id uuid references ap_bank_accounts(id),
  currency text not null default 'CAD' check (currency in ('CAD', 'USD', 'EUR')),
  terms_days int,
  -- How to pay them: banking details, e-transfer address, wire instructions…
  payment_details text,
  -- Standing remark shown next to the supplier every week (e.g. "automatic on the 1st").
  notes text,
  contact_name text,
  contact_email text,
  remittance_email text,
  qbo_vendor_name text,
  sheet_tab text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ap_suppliers_name_key on ap_suppliers (lower(name));

create table ap_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references ap_suppliers(id) on delete cascade,
  kind text not null default 'invoice'
    check (kind in ('invoice', 'credit', 'opening_balance', 'adjustment')),
  invoice_number text,
  po_number text,
  invoice_date date,
  due_date date,
  amount numeric(14,2) not null,
  description text,
  in_quickbooks boolean not null default false,
  file_path text,
  source text not null default 'portal' check (source in ('portal', 'import')),
  -- Set on the credit created by an overpayment, so voiding that payment voids it too.
  origin_payment_id uuid,
  voided_at timestamptz,
  voided_by uuid references staff(id),
  void_reason text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'credit' and amount < 0) or kind <> 'credit')
);
create index ap_invoices_supplier_idx on ap_invoices (supplier_id);

create table ap_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'closed')),
  notes text,
  submitted_at timestamptz,
  submitted_by uuid references staff(id),
  approver_name text,
  approver_email text,
  token_hash text unique,
  token_expires_at timestamptz,
  approved_at timestamptz,
  approved_via text check (approved_via in ('link', 'manual')),
  approver_comment text,
  closed_at timestamptz,
  closed_by uuid references staff(id),
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

-- Bank balances and the fixed weekly outflows (payroll, credit card, Vault /
-- Questor…), per account. Signed: balances positive, outflows negative.
create table ap_run_cash_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ap_runs(id) on delete cascade,
  bank_account_id uuid not null references ap_bank_accounts(id),
  kind text not null default 'other'
    check (kind in ('balance', 'payroll', 'credit_card', 'loan', 'transfer', 'other')),
  label text not null,
  amount numeric(14,2),
  as_of date,
  note text,
  sort_order int not null default 0
);
create index ap_run_cash_lines_run_idx on ap_run_cash_lines (run_id);

create table ap_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references ap_suppliers(id) on delete cascade,
  paid_on date not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text,
  bank_account_id uuid references ap_bank_accounts(id),
  reference text,
  notes text,
  source text not null default 'portal' check (source in ('portal', 'import')),
  run_line_id uuid,
  remittance_sent_at timestamptz,
  remittance_sent_by uuid references staff(id),
  voided_at timestamptz,
  voided_by uuid references staff(id),
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index ap_payments_supplier_idx on ap_payments (supplier_id);

create table ap_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references ap_payments(id) on delete cascade,
  invoice_id uuid not null references ap_invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0)
);
create index ap_alloc_payment_idx on ap_payment_allocations (payment_id);
create index ap_alloc_invoice_idx on ap_payment_allocations (invoice_id);

create table ap_run_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ap_runs(id) on delete cascade,
  supplier_id uuid not null references ap_suppliers(id),
  owed_at_submit numeric(14,2),
  suggested_amount numeric(14,2),
  suggested_note text,
  approved_amount numeric(14,2),
  approver_note text,
  payment_id uuid references ap_payments(id),
  processed_at timestamptz,
  processed_by uuid references staff(id),
  remittance_sent_at timestamptz,
  remittance_sent_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  unique (run_id, supplier_id)
);
alter table ap_invoices
  add constraint ap_invoices_origin_payment_fk foreign key (origin_payment_id) references ap_payments(id) on delete set null;
alter table ap_payments
  add constraint ap_payments_run_line_fk foreign key (run_line_id) references ap_run_lines(id) on delete set null;

create table ap_events (
  id bigint generated always as identity primary key,
  run_id uuid references ap_runs(id) on delete cascade,
  supplier_id uuid references ap_suppliers(id) on delete cascade,
  actor_staff_id uuid references staff(id),
  actor_label text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ap_events_run_idx on ap_events (run_id);
create index ap_events_supplier_idx on ap_events (supplier_id);

create table ap_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into ap_settings (key, value)
select 'approver', jsonb_build_object('name', full_name, 'email', email)
from staff where email = 'jorge@oaziz.ca';
insert into ap_settings (key, value) values
  ('notify_emails', '["meissam@oaziz.ca"]'::jsonb),
  ('cash_template', '[
    {"account":"rbc","kind":"balance","label":"Solde bancaire RBC Oaziz"},
    {"account":"rbc","kind":"payroll","label":"Paie hebdomadaire (+9317-3516 Qc)"},
    {"account":"rbc","kind":"credit_card","label":"Remboursement carte de crédit Meissam (BMO 001-02441-02443978170)"},
    {"account":"rbc","kind":"loan","label":"Vault / Questor — 632,41 $ le 1er du mois (QT49388 jusqu''à mars 2027, QT52213 jusqu''à sept. 2029)"},
    {"account":"td_mjlb","kind":"balance","label":"Solde bancaire TD MJLB"}
  ]'::jsonb);

-- Open amount per invoice.
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

-- Records a payment and allocates it oldest-first (or to the given invoices
-- first). Anything left over becomes a credit on the supplier's account, so the
-- balance always equals invoices minus payments. One transaction.
create or replace function ap_record_payment(
  p_supplier_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_bank_account_id uuid,
  p_reference text,
  p_notes text,
  p_staff_id uuid,
  p_run_line_id uuid default null,
  p_invoice_ids uuid[] default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_payment uuid;
  v_left numeric := round(p_amount, 2);
  v_take numeric;
  r record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Serialize concurrent payments to the same supplier.
  perform 1 from ap_suppliers where id = p_supplier_id for update;

  insert into ap_payments (supplier_id, paid_on, amount, payment_method, bank_account_id, reference, notes, run_line_id, created_by)
  values (p_supplier_id, p_paid_on, round(p_amount, 2), p_method, p_bank_account_id, nullif(p_reference, ''), nullif(p_notes, ''), p_run_line_id, p_staff_id)
  returning id into v_payment;

  for r in
    select id, open_amount from ap_invoice_balances
    where supplier_id = p_supplier_id and open_amount > 0
    order by (p_invoice_ids is not null and id = any(p_invoice_ids)) desc,
             coalesce(due_date, invoice_date, created_at::date), invoice_date nulls first, created_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.open_amount);
    insert into ap_payment_allocations (payment_id, invoice_id, amount) values (v_payment, r.id, v_take);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    insert into ap_invoices (supplier_id, kind, invoice_date, amount, description, origin_payment_id, created_by)
    values (p_supplier_id, 'credit', p_paid_on, -v_left, 'Crédit — paiement excédentaire', v_payment, p_staff_id);
  end if;

  return v_payment;
end;
$$;

-- Voiding a payment frees its allocations (the views ignore voided payments)
-- and voids any overpayment credit it created.
create or replace function ap_void_payment(p_payment_id uuid, p_staff_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare v_p ap_payments;
begin
  update ap_payments set voided_at = now(), voided_by = p_staff_id
  where id = p_payment_id and voided_at is null
  returning * into v_p;
  if v_p.id is null then return; end if;
  update ap_invoices set voided_at = now(), voided_by = p_staff_id, void_reason = 'Paiement annulé'
  where origin_payment_id = p_payment_id and voided_at is null;
  update ap_run_lines set payment_id = null, processed_at = null, processed_by = null
  where payment_id = p_payment_id;
end;
$$;

revoke all on function ap_record_payment(uuid, numeric, date, text, uuid, text, text, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function ap_void_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function ap_record_payment(uuid, numeric, date, text, uuid, text, text, uuid, uuid, uuid[]) to service_role;
grant execute on function ap_void_payment(uuid, uuid) to service_role;

alter table ap_bank_accounts enable row level security;
alter table ap_suppliers enable row level security;
alter table ap_invoices enable row level security;
alter table ap_runs enable row level security;
alter table ap_run_cash_lines enable row level security;
alter table ap_payments enable row level security;
alter table ap_payment_allocations enable row level security;
alter table ap_run_lines enable row level security;
alter table ap_events enable row level security;
alter table ap_settings enable row level security;

revoke all on ap_invoice_balances, ap_supplier_balances from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('payables', 'payables', false)
on conflict (id) do nothing;
