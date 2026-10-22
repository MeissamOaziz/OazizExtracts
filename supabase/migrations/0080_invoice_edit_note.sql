-- Comment trail when an invoice is edited by hand (who, when, why, amount before/after).
alter table ap_invoices add column if not exists edit_note text;
