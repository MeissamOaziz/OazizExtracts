-- Shipments: the Chain of Custody number, given when the label is ready
-- (COC-YYYYMMDD-NNN, numbered per day like the forms QA filled by hand), and
-- where the ship-to address came from (QuickBooks customer, the PO, or typed).

alter table sh_shipments
  add column coc_no text unique,
  add column ship_to_source text check (ship_to_source in ('quickbooks', 'po', 'manual'));

update sh_shipments set ship_to_source = 'manual' where ship_to is not null and ship_to_source is null;

create table sh_coc_counters (
  day date primary key,
  last int not null
);
alter table sh_coc_counters enable row level security;
revoke all on sh_coc_counters from anon, authenticated;
