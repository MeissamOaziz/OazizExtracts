-- Atelier — packaging runs: a released lot becomes labelled, counted units.
--
-- Meissam's brief: "we might have an extra step, which is packaging a lot into
-- units that may or may not get excised, but they will be labelled with a
-- packaging date, THC and CBD values, GTINs etc." — and, from the very first
-- message, the reason the whole project exists: missing packaging information
-- (GTIN, case GTIN, excise province) must become structurally impossible.
--
-- Three decisions worth stating, because they are the ones that could be argued:
--
-- 1. A packaging run PRODUCES A LOT, not a separate kind of record. Packaged goods
--    are the same material with a SKU, a unit count and a label, so making them a
--    lot means movements, genealogy, inventory, sampling and release all keep
--    working unchanged, and "track every gram" survives the packaging step.
--
-- 2. The packaged lot INHERITS the source lot's release status. Packaging is a
--    physical operation: the material and its COA have not changed, so asking QA
--    to release the same material twice would be friction without a safety gain.
--    A batch packaged is still a batch, and phase 5 is where shipping refuses it.
--
-- 3. Label values are SNAPSHOTTED onto the run at completion. If someone edits the
--    product master or a retest moves the potency next month, what the label said
--    on the day must not change underneath us.

create type ops_packaging_status as enum ('draft', 'done', 'cancelled');

-- ============================================================
-- Numbering — PKG-<year>-<0001>
-- ============================================================

create or replace function ops_set_packaging_run_no()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  y text := to_char(now() at time zone 'America/Toronto', 'YYYY');
  n int;
begin
  if new.run_no is not null and new.run_no <> '' then return new; end if;
  insert into ops_counters (scope, last_value) values ('pkg:' || y, 1)
  on conflict (scope) do update set last_value = ops_counters.last_value + 1
  returning last_value into n;
  new.run_no := 'PKG-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$fn$;

revoke execute on function ops_set_packaging_run_no() from public, anon, authenticated;

-- ============================================================
-- The run
-- ============================================================

create table ops_packaging_runs (
  id                uuid primary key default gen_random_uuid(),
  run_no            text not null unique,
  status            ops_packaging_status not null default 'draft',

  -- What is being packaged, out of what.
  product_id        uuid not null references ops_products(id),
  source_lot_id     uuid not null references ops_lots(id),
  -- Set when the run serves a specific order; null when packaging for stock.
  order_id          uuid references ops_orders(id),
  stage_id          uuid references ops_wo_stages(id),

  packaged_on       date not null default current_date,
  units_planned     int,
  units_produced    int,
  unit_size_g       numeric(12,3),
  -- Actual grams taken out of the source lot, giveaway included.
  consumed_g        numeric(14,3),

  -- Excise. A unit may or may not be stamped; when it is, the province decides
  -- which stamp, so it stops being optional.
  is_excised        boolean not null default false,
  excise_province   text,

  -- Label snapshot, frozen at completion (see decision 3 above).
  label_gtin        text,
  label_case_gtin   text,
  label_units_per_case int,
  label_thc_pct     numeric(6,3),
  label_cbd_pct     numeric(6,3),
  label_cultivar    text,

  output_lot_id     uuid references ops_lots(id),
  notes             text,
  completed_at      timestamptz,
  completed_by_staff_id uuid references staff(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index ops_packaging_runs_source_idx  on ops_packaging_runs (source_lot_id);
create index ops_packaging_runs_product_idx on ops_packaging_runs (product_id);
create index ops_packaging_runs_order_idx   on ops_packaging_runs (order_id);
create index ops_packaging_runs_status_idx  on ops_packaging_runs (status);

create trigger ops_packaging_runs_no
before insert on ops_packaging_runs
for each row execute function ops_set_packaging_run_no();

create trigger ops_packaging_runs_touch_updated_at
before update on ops_packaging_runs
for each row execute function touch_updated_at();

comment on table ops_packaging_runs is
  'One packaging run: a source lot becomes labelled units of one SKU. Completing it is the only thing that writes the movements and the output lot.';

-- The product a lot represents, once it has been packaged into a SKU.
alter table ops_lots add column if not exists product_id uuid references ops_products(id);
create index if not exists ops_lots_product_idx on ops_lots (product_id);

alter table ops_packaging_runs enable row level security;

create policy ops_packaging_runs_read on ops_packaging_runs
  for select to authenticated using (true);

-- Packaging is production work, so anyone with a role may record it.
create policy ops_packaging_runs_write on ops_packaging_runs
  for all to authenticated
  using (ops_current_role() is not null)
  with check (ops_current_role() is not null);

-- ============================================================
-- Completing a run — the only path that writes anything
-- ============================================================

create or replace function ops_complete_packaging_run(
  p_run             uuid,
  p_units_produced  int,
  p_consumed_g      numeric,
  p_packaged_on     date default current_date,
  p_is_excised      boolean default null,
  p_excise_province text default null,
  p_thc_pct         numeric default null,
  p_cbd_pct         numeric default null,
  p_cultivar        text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  r             ops_packaging_runs;
  prod          ops_products;
  src           ops_lots;
  v_email       text := auth.jwt() ->> 'email';
  v_actor       uuid;
  v_customer    ops_customers;
  v_on_hand     numeric;
  v_out_lot     uuid;
  v_thc         numeric;
  v_cbd         numeric;
  v_cultivar    text;
  v_excised     boolean;
  v_province    text;
begin
  select * into r from ops_packaging_runs where id = p_run for update;
  if r.id is null then
    raise exception 'Unknown packaging run %', p_run;
  end if;
  if r.status = 'done' then
    raise exception 'That packaging run is already completed.';
  end if;
  if r.status = 'cancelled' then
    raise exception 'That packaging run was cancelled.';
  end if;

  select * into prod from ops_products where id = r.product_id;
  select * into src  from ops_lots     where id = r.source_lot_id for update;
  select id into v_actor from staff where email = v_email;

  if r.order_id is not null then
    select c.* into v_customer
    from ops_orders o join ops_customers c on c.id = o.customer_id
    where o.id = r.order_id;
  end if;

  -- ---------------------------------------------------------- quantities
  if p_units_produced is null or p_units_produced <= 0 then
    raise exception 'Record how many units came out of this run.';
  end if;
  if p_consumed_g is null or p_consumed_g <= 0 then
    raise exception 'Record how much material this run consumed.';
  end if;

  select coalesce(sum(
           case when direction in ('received', 'produced', 'adjustment') then qty_g else -qty_g end
         ), 0)
    into v_on_hand
    from ops_lot_movements where lot_id = r.source_lot_id;

  if p_consumed_g > v_on_hand then
    raise exception 'Only %g of % is on hand; this run wants %g.',
      v_on_hand, src.lot_code, p_consumed_g;
  end if;

  -- ------------------------------------------------------- label content
  -- Potency falls back to the source lot's latest result, because that is what
  -- the label would be printed from anyway.
  v_thc := coalesce(p_thc_pct, (
    select thc_pct from ops_lot_potency where lot_id = r.source_lot_id
    order by recorded_at desc limit 1));
  v_cbd := coalesce(p_cbd_pct, (
    select cbd_pct from ops_lot_potency where lot_id = r.source_lot_id
    order by recorded_at desc limit 1));
  v_cultivar := coalesce(nullif(trim(coalesce(p_cultivar, '')), ''), src.cultivar);
  v_excised  := coalesce(p_is_excised, r.is_excised);
  v_province := coalesce(nullif(trim(coalesce(p_excise_province, '')), ''), r.excise_province);

  if v_thc is null then
    raise exception 'A THC value is required on the label. Record the lot''s potency, or enter it on the run.';
  end if;

  -- A rotational SKU carries the cultivar on the label, so it cannot be blank.
  if prod.is_rotational and v_cultivar is null then
    raise exception 'This SKU is rotational, so the cultivar goes on the label and is required.';
  end if;

  -- A unit that is not bulk is scanned at retail, so it needs its barcode.
  if not coalesce(prod.is_bulk, false) and nullif(trim(coalesce(prod.gtin, '')), '') is null then
    raise exception 'This SKU has no GTIN. Add it to the product before packaging.';
  end if;

  -- Excise stamps are provincial: which one is not a detail we can leave blank.
  if coalesce(prod.requires_excise, true) and v_excised and v_province is null then
    raise exception 'Excised units need the excise province, because it decides which stamp goes on.';
  end if;

  -- SQDC and OCS reject a shipment whose cases are not identified.
  if v_customer.requires_case_gtin then
    if nullif(trim(coalesce(prod.case_gtin, '')), '') is null then
      raise exception '% requires a case GTIN, and this SKU has none.', v_customer.name;
    end if;
    if coalesce(prod.units_per_case, 0) <= 0 then
      raise exception '% requires units per case, and this SKU has none.', v_customer.name;
    end if;
  end if;

  -- ------------------------------------------------------- the output lot
  -- Inherits the source's release status: same material, same COA (decision 2).
  insert into ops_lots (
    lot_code, material_id, product_id, state, origin, cultivar,
    supplier_name, supplier_id, owner_customer_id,
    produced_at, qty_on_hand_g, qty_on_hand_units, created_by,
    coa_ref, released_at, released_by_staff_id, release_notes,
    conditional_at, conditional_by_staff_id, conditional_reason, customer_acknowledged
  ) values (
    null, src.material_id, r.product_id, 'packaged', 'produced', v_cultivar,
    src.supplier_name, src.supplier_id, src.owner_customer_id,
    coalesce(p_packaged_on, current_date), 0, p_units_produced, v_email,
    src.coa_ref, src.released_at, src.released_by_staff_id, src.release_notes,
    src.conditional_at, src.conditional_by_staff_id, src.conditional_reason,
    src.customer_acknowledged
  )
  returning id into v_out_lot;

  -- Movements: out of the source, into the packaged lot.
  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, note)
  values (r.source_lot_id, 'consumed', p_consumed_g, v_actor, v_email, 'packaging ' || r.run_no);

  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, note)
  values (v_out_lot, 'produced', p_consumed_g, v_actor, v_email, 'packaging ' || r.run_no);

  insert into ops_lot_links (parent_lot_id, child_lot_id)
  values (r.source_lot_id, v_out_lot)
  on conflict (parent_lot_id, child_lot_id) do nothing;

  update ops_lots
     set qty_on_hand_g = greatest(qty_on_hand_g - p_consumed_g, 0)
   where id = r.source_lot_id;

  update ops_lots set qty_on_hand_g = p_consumed_g where id = v_out_lot;

  -- Carry the potency across so the packaged lot reads like any other.
  insert into ops_lot_potency (lot_id, thc_pct, cbd_pct, source, coa_ref)
  values (v_out_lot, v_thc, v_cbd, 'calculated', src.coa_ref);

  -- ------------------------------------------------------------- the run
  update ops_packaging_runs
     set status               = 'done',
         units_produced       = p_units_produced,
         consumed_g           = p_consumed_g,
         packaged_on          = coalesce(p_packaged_on, current_date),
         unit_size_g          = coalesce(unit_size_g, prod.sku_size_g),
         is_excised           = v_excised,
         excise_province      = v_province,
         label_gtin           = prod.gtin,
         label_case_gtin      = prod.case_gtin,
         label_units_per_case = prod.units_per_case,
         label_thc_pct        = v_thc,
         label_cbd_pct        = v_cbd,
         label_cultivar       = v_cultivar,
         output_lot_id        = v_out_lot,
         completed_at         = now(),
         completed_by_staff_id = v_actor
   where id = p_run;

  return v_out_lot;
end;
$fn$;

grant execute on function ops_complete_packaging_run(
  uuid, int, numeric, date, boolean, text, numeric, numeric, text
) to authenticated;

-- A run that has not been completed has written nothing, so cancelling it is free.
-- A completed run is undone the way every other completed thing is: an adjustment
-- on the lots, never a deletion of history.
create or replace function ops_cancel_packaging_run(p_run uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare v_status ops_packaging_status;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to cancel a packaging run.';
  end if;

  select status into v_status from ops_packaging_runs where id = p_run for update;
  if v_status is null then
    raise exception 'Unknown packaging run %', p_run;
  end if;
  if v_status = 'done' then
    raise exception 'That run is completed. Adjust the lots instead, so the history stays intact.';
  end if;

  update ops_packaging_runs
     set status = 'cancelled',
         notes  = concat_ws(E'\n', notes, 'Cancelled: ' || trim(p_reason))
   where id = p_run;
end;
$fn$;

grant execute on function ops_cancel_packaging_run(uuid, text) to authenticated;

-- ============================================================
-- Reading
-- ============================================================

create view v_ops_packaging_runs
with (security_invoker = true) as
select
  r.id, r.run_no, r.status, r.packaged_on,
  r.units_planned, r.units_produced, r.unit_size_g, r.consumed_g,
  r.is_excised, r.excise_province,
  r.label_gtin, r.label_case_gtin, r.label_units_per_case,
  r.label_thc_pct, r.label_cbd_pct, r.label_cultivar,
  r.notes, r.completed_at,
  p.name as product_name, p.brand, p.sku_size_g, p.is_bulk,
  p.gtin as product_gtin, p.case_gtin as product_case_gtin,
  p.units_per_case as product_units_per_case,
  p.requires_excise, p.is_rotational,
  src.lot_code as source_lot_code, src.id as source_lot_id,
  src.release_status as source_release_status,
  m.code as material_code, m.name_fr as material_fr, m.name_en as material_en,
  out.lot_code as output_lot_code, r.output_lot_id,
  o.order_no, o.customer_po_ref, c.name as customer_name,
  c.requires_case_gtin as customer_requires_case_gtin,
  st.full_name as completed_by
from ops_packaging_runs r
join ops_products p        on p.id = r.product_id
join ops_lots src          on src.id = r.source_lot_id
join ops_materials m       on m.id = src.material_id
left join ops_lots out     on out.id = r.output_lot_id
left join ops_orders o     on o.id = r.order_id
left join ops_customers c  on c.id = o.customer_id
left join staff st         on st.id = r.completed_by_staff_id;

comment on view v_ops_packaging_runs is
  'Packaging runs with the SKU, the source lot and the destination customer, plus what the label ended up saying.';

-- ============================================================
-- Packaged goods show up in inventory as units, not only grams
-- ============================================================

drop view if exists v_ops_inventory;

create view v_ops_inventory
with (security_invoker = true) as
select
  l.id, l.lot_code, l.is_released, l.release_status, l.state,
  l.cultivar, led.supplier_name, l.coa_ref, l.conditional_at,
  l.origin, l.owner_customer_id, led.owner_customer_name,
  m.code as material_code, m.name_fr as material_fr, m.name_en as material_en,
  m.category as material_category, m.is_cannabis,
  led.computed_on_hand_g, led.sampled_g,
  led.thc_pct, led.cbd_pct, led.potency_source,
  led.sample_count, led.pending_sample_count,
  l.received_at, l.produced_at, l.released_at,
  -- Packaged goods carry their SKU and a unit count alongside the grams.
  l.product_id, p.name as product_name, p.brand, p.sku_size_g, p.gtin,
  l.qty_on_hand_units,
  (l.product_id is not null) as is_packaged,
  pr.run_no as packaging_run_no, pr.packaged_on, pr.is_excised, pr.excise_province
from ops_lots l
join ops_materials m      on m.id = l.material_id
join v_ops_lot_ledger led on led.id = l.id
left join ops_products p  on p.id = l.product_id
left join ops_packaging_runs pr on pr.output_lot_id = l.id and pr.status = 'done'
where led.computed_on_hand_g > 0
  and l.state <> 'destroyed';

comment on view v_ops_inventory is
  'Everything with quantity remaining, bulk and packaged. Sort by material_category, material name, then thc_pct desc.';
