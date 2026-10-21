-- Shipping work order lines: the customer's item number (OCS item #, read from
-- the PO), the packaging date of each item (OCS requires it per item) and the
-- number of cases shipped for the line — the last two filled by production.
-- They feed the OCS packing slip and pallet placard.

alter table ps_swo_lines
  add column item_no text,
  add column packaging_date date,
  add column cases int check (cases is null or cases >= 0);
