-- Suppliers deliberately left unlinked from QuickBooks (e.g. two Hydro-Québec
-- accounts billed separately, Oaziz vs MJLB city taxes). The vendor-link
-- suggestions skip them; "Restore" on the QuickBooks page clears the flag.
alter table ap_suppliers add column if not exists qbo_link_ignored boolean not null default false;
