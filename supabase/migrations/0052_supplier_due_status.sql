-- Manual payment status per supplier, set on the weekly page (Meissam only):
-- not_due / unpaid / paid. Null = automatic (unpaid when anything is overdue
-- or has no due date, otherwise not due).
alter table ap_suppliers
  add column due_status text check (due_status in ('not_due', 'unpaid', 'paid')),
  add column due_status_by uuid references staff(id),
  add column due_status_at timestamptz;
comment on column ap_suppliers.due_status is 'Manual payment status set by Meissam on the weekly page (null = automatic).';
