-- Suppliers paid without bills (RQ source deductions, taxes generated in QB):
-- their payments default to "expense" so no credit is left on the supplier.
alter table ap_suppliers add column if not exists payments_are_expenses boolean not null default false;
