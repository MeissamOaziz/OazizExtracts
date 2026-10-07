-- RBC → TD MJLB weekly deposit recorded as a real payment.
-- The funded account (TD MJLB) names the supplier its deposits are paid to
-- (MJLB, whose QuickBooks bills carry the debt being paid off). When a week's
-- TD payments are made, the deposit is recorded as a payment from the funder
-- (RBC) to that supplier, tagged with the account it funds and the week.

alter table ap_bank_accounts
  add column funding_supplier_id uuid references ap_suppliers(id);

alter table ap_payments
  add column transfer_to_account_id uuid references ap_bank_accounts(id),
  add column funds_run_id uuid references ap_runs(id) on delete set null;

create index ap_payments_funds_run_idx on ap_payments (funds_run_id) where funds_run_id is not null;
create index ap_payments_transfer_to_idx on ap_payments (transfer_to_account_id) where transfer_to_account_id is not null;
