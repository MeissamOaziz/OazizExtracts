-- Weekly payments: choose which invoices a payment pays (as in QuickBooks), and
-- mark a line as an expense reimbursement (already entered in QB as an expense,
-- no bill) so paying it doesn't leave a credit on the supplier.

alter table ap_run_lines
  add column if not exists allocations jsonb,          -- [{ "invoice_id": uuid, "amount": number }], null = oldest first
  add column if not exists is_expense boolean not null default false;

-- Like ap_record_payment, with an explicit split:
--   p_allocations: invoices paid first, each up to the amount given (and its open balance);
--                  whatever is left goes oldest first, then becomes a credit.
--   p_expense:     the payment pays an expense already in QuickBooks: an invoice
--                  of the same amount is created ("in QuickBooks", tied to the
--                  payment so voiding the payment voids it too) and paid in full.
create or replace function ap_record_payment_split(
  p_supplier_id uuid, p_amount numeric, p_paid_on date, p_method text, p_bank_account_id uuid,
  p_reference text, p_notes text, p_staff_id uuid, p_run_line_id uuid default null,
  p_allocations jsonb default null, p_expense boolean default false, p_expense_note text default null
) returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_payment uuid;
  v_left numeric := round(p_amount, 2);
  v_take numeric;
  v_inv uuid;
  a record;
  r record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform 1 from ap_suppliers where id = p_supplier_id for update;

  insert into ap_payments (supplier_id, paid_on, amount, payment_method, bank_account_id, reference, notes, run_line_id, created_by)
  values (p_supplier_id, p_paid_on, round(p_amount, 2), p_method, p_bank_account_id, nullif(p_reference, ''), nullif(p_notes, ''), p_run_line_id, p_staff_id)
  returning id into v_payment;

  if p_expense then
    insert into ap_invoices (supplier_id, kind, invoice_date, amount, description, in_quickbooks, source, origin_payment_id, created_by)
    values (p_supplier_id, 'invoice', p_paid_on, round(p_amount, 2),
            coalesce(nullif(p_expense_note, ''), 'Remboursement de dépense — saisi dans QuickBooks'), true, 'portal', v_payment, p_staff_id)
    returning id into v_inv;
    insert into ap_payment_allocations (payment_id, invoice_id, amount) values (v_payment, v_inv, round(p_amount, 2));
    return v_payment;
  end if;

  if p_allocations is not null then
    for a in
      select (e->>'invoice_id')::uuid as invoice_id, round((e->>'amount')::numeric, 2) as amount
      from jsonb_array_elements(p_allocations) e
    loop
      exit when v_left <= 0;
      select open_amount into v_take from ap_invoice_balances
      where id = a.invoice_id and supplier_id = p_supplier_id and open_amount > 0;
      continue when v_take is null or a.amount is null or a.amount <= 0;
      v_take := least(v_left, a.amount, v_take);
      insert into ap_payment_allocations (payment_id, invoice_id, amount) values (v_payment, a.invoice_id, v_take);
      v_left := v_left - v_take;
    end loop;
  end if;

  for r in
    select id, open_amount from ap_invoice_balances
    where supplier_id = p_supplier_id and open_amount > 0
    order by coalesce(due_date, invoice_date, created_at::date), invoice_date nulls first, created_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.open_amount);
    -- One line per invoice: top up an invoice that was already chosen above.
    update ap_payment_allocations set amount = amount + v_take where payment_id = v_payment and invoice_id = r.id;
    if not found then
      insert into ap_payment_allocations (payment_id, invoice_id, amount) values (v_payment, r.id, v_take);
    end if;
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    insert into ap_invoices (supplier_id, kind, invoice_date, amount, description, origin_payment_id, created_by)
    values (p_supplier_id, 'credit', p_paid_on, -v_left, 'Crédit — paiement excédentaire', v_payment, p_staff_id);
  end if;

  return v_payment;
end;
$$;
