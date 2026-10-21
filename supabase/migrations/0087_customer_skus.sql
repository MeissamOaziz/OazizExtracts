-- Customer SKUs: a buyer's item number for each product (the OCS item # printed
-- on its POs, e.g. 107510_28g_) and how many units go in a case. Fills the item #
-- and the case count on shipping work orders and on the OCS packing slip and
-- pallet placard. Current OCS SKUs ship in cases of 6; others differ (SQDC Aube
-- ships in cases of 24) and are set in Production > Settings. New OCS SKUs read
-- from a PO are added automatically.

create table ps_customer_skus (
  id uuid primary key default gen_random_uuid(),
  customer text not null check (customer in ('OCS', 'SQDC', 'TEEDY')),
  item_no text not null check (length(trim(item_no)) > 0),
  product_name text not null check (length(trim(product_name)) > 0),
  units_per_case int check (units_per_case is null or units_per_case > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (customer, item_no)
);

insert into ps_customer_skus (customer, item_no, product_name, units_per_case) values
  ('OCS', '107510_28g_', 'Connoisseurs Crop - Rotational Dank Outdoor OZ', 6),
  ('OCS', '107511_28g_', 'Connoisseur''s Craft - Rotational Smallz OZ', 6),
  ('OCS', '107618_28g_', 'Rotational Selection OZ', 6),
  ('OCS', '302516_1g_', 'Connoisseur''s Hash Rosin - Rotational R 510 Thread Cartridge', 6),
  ('OCS', '302542_1g_', 'Full Spectrum CBD Blueberry Muffins 510 Thread Cartridge', 6),
  ('OCS', '302543_0.5g_', 'Hash Rosin AIO', 6),
  ('OCS', '312519_2g_', 'Connoisseur''s Classics - Black Afghan Hash', 6),
  ('OCS', '312582_1.5g_', 'Fruit Temple Ball Hash', 6),
  ('OCS', '312583_1.5g_', 'Gas Temple Ball Hash', 6),
  ('OCS', '312584_1g_', 'Sativa Hash Oil', 6),
  ('OCS', '312585_1g_', 'Indica Hash Oil', 6);

alter table ps_customer_skus enable row level security;
revoke all on ps_customer_skus from anon, authenticated;
