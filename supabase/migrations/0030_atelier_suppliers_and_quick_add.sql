-- Atelier — suppliers as real records, and "add new" from every reference picker.
--
-- Meissam, 2026-09-25:
--   "When entering a new product or customer or supplier etc, we need the dropdown
--    to have an option to add new as the autofill won't show an existing option,
--    so a window can open QB style to add the info to create."
--
-- Two things were in the way:
--   1. Supplier was free text on the lot, so there was no list to pick from and
--      nothing to add to. It becomes a table.
--   2. Only ops_customers and ops_products accepted an insert from a non-manager
--      (0019). A combobox that offers "Add …" and then fails on save is worse than
--      no combobox, so the same rule now covers every reference table a picker reads.

-- ============================================================
-- Suppliers
-- ============================================================

create table if not exists ops_suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  short_code    text unique,
  licence_no    text,
  contact_name  text,
  contact_email text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table ops_suppliers is
  'Whoever material comes in from: licensed producers we buy trim from, distillate and isolate vendors, packaging vendors. Also the counterparty on a supplier-special arrangement.';

alter table ops_suppliers enable row level security;

create policy ops_suppliers_read_authenticated on ops_suppliers
  for select to authenticated using (true);

create policy ops_suppliers_manage on ops_suppliers
  for all to authenticated using (ops_can_manage()) with check (ops_can_manage());

create policy ops_suppliers_insert_any_role on ops_suppliers
  for insert to authenticated with check (ops_current_role() is not null);

-- Seed from the suppliers already named in free text on existing lots, so nothing
-- has to be retyped. (No-op on an empty register.)
insert into ops_suppliers (name)
select distinct trim(supplier_name)
from ops_lots
where nullif(trim(coalesce(supplier_name, '')), '') is not null
on conflict do nothing;

-- ============================================================
-- The lot points at a supplier record
-- ============================================================

-- supplier_name stays: it is what was typed at the time, and the ledger does not
-- get rewritten. supplier_id is the link going forward.
alter table ops_lots add column if not exists supplier_id uuid references ops_suppliers(id);
create index if not exists ops_lots_supplier_idx on ops_lots (supplier_id);

update ops_lots l
set supplier_id = s.id
from ops_suppliers s
where l.supplier_id is null
  and trim(coalesce(l.supplier_name, '')) = s.name;

comment on column ops_lots.supplier_id is
  'Who this material came in from. Also the counterparty for origin = supplier_special.';

-- ============================================================
-- Insert permitted to any Atelier role, on every reference table
-- ============================================================

-- Same reasoning as 0019, extended: INSERT must never be the thing that blocks
-- someone mid-form. UPDATE and DELETE stay with the managers via the _manage policy.
do $$
declare t text;
begin
  foreach t in array array['ops_materials', 'ops_rooms', 'ops_process_types'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t || '_insert_any_role'
    ) then
      execute format(
        'create policy %I on %I for insert to authenticated with check (ops_current_role() is not null)',
        t || '_insert_any_role', t
      );
    end if;
  end loop;
end $$;

-- ============================================================
-- Receiving: the supplier is picked, and it is the supplier-special counterparty
-- ============================================================

-- 0028 required a *customer* for both new origins. That was wrong for
-- supplier_special: the counterparty there is the supplier who fronted the trim.
-- Tolling still points at the customer whose material it is.
drop function if exists ops_receive_lot(
  uuid, numeric, text, ops_lot_origin, text, date, text,
  numeric, numeric, ops_potency_source, text, date, text, text, text, uuid
);

create or replace function ops_receive_lot(
  p_material_id     uuid,
  p_qty_g           numeric,
  p_lot_code        text default null,
  p_origin          ops_lot_origin default 'purchased',
  p_supplier        text default null,
  p_received_at     date default current_date,
  p_cultivar        text default null,
  p_thc_pct         numeric default null,
  p_cbd_pct         numeric default null,
  p_potency_source  ops_potency_source default 'supplier',
  p_coa_ref         text default null,
  p_tested_at       date default null,
  p_groweriq_ref    text default null,
  p_supplier_ref    text default null,
  p_notes           text default null,
  p_owner_customer_id uuid default null,
  p_supplier_id     uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_lot      uuid;
  v_email    text := auth.jwt() ->> 'email';
  v_actor    uuid;
  v_when     timestamptz;
  v_supplier text;
begin
  if p_material_id is null then
    raise exception 'A material is required to receive a lot.';
  end if;
  if p_qty_g is null or p_qty_g <= 0 then
    raise exception 'Received quantity must be greater than zero.';
  end if;

  -- Tolling material belongs to the customer who sent it in.
  if p_origin = 'customer_supplied' and p_owner_customer_id is null then
    raise exception 'Material supplied by a customer needs the customer recorded.';
  end if;
  -- A supplier-special arrangement is owed back to the supplier who fronted it.
  if p_origin = 'supplier_special' and p_supplier_id is null then
    raise exception 'A supplier-special arrangement needs the supplier recorded.';
  end if;

  select id into v_actor from staff where email = v_email;

  -- Keep the typed name in step with the picked record, so the ledger reads the
  -- same whichever way the lot was entered.
  v_supplier := coalesce(
    nullif(trim(coalesce(p_supplier, '')), ''),
    (select name from ops_suppliers where id = p_supplier_id)
  );

  v_when := (coalesce(p_received_at, current_date)::timestamp) at time zone 'America/Toronto';

  insert into ops_lots (
    lot_code, material_id, state, origin, cultivar, supplier_name, supplier_id,
    received_at, qty_on_hand_g, notes, created_by, owner_customer_id
  ) values (
    nullif(trim(coalesce(p_lot_code, '')), ''),
    p_material_id, 'received', p_origin, p_cultivar, v_supplier, p_supplier_id,
    p_received_at, p_qty_g, p_notes, v_email, p_owner_customer_id
  )
  returning id into v_lot;

  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, occurred_at, note)
  values (v_lot, 'received', p_qty_g, v_actor, v_email, v_when, 'reception');

  if p_thc_pct is not null or p_cbd_pct is not null then
    insert into ops_lot_potency (lot_id, thc_pct, cbd_pct, source, coa_ref, tested_at)
    values (v_lot, p_thc_pct, p_cbd_pct, coalesce(p_potency_source, 'supplier'), p_coa_ref, p_tested_at);
  end if;

  if nullif(trim(coalesce(p_groweriq_ref, '')), '') is not null then
    insert into ops_lot_aliases (lot_id, system, external_ref)
    values (v_lot, 'groweriq', trim(p_groweriq_ref))
    on conflict (system, external_ref) do nothing;
  end if;
  if nullif(trim(coalesce(p_supplier_ref, '')), '') is not null then
    insert into ops_lot_aliases (lot_id, system, external_ref)
    values (v_lot, 'supplier', trim(p_supplier_ref))
    on conflict (system, external_ref) do nothing;
  end if;

  return v_lot;
end;
$fn$;

grant execute on function ops_receive_lot(
  uuid, numeric, text, ops_lot_origin, text, date, text,
  numeric, numeric, ops_potency_source, text, date, text, text, text, uuid, uuid
) to authenticated;

-- ============================================================
-- Supplier on the lot views
-- ============================================================

drop view if exists v_ops_inventory;
drop view if exists v_ops_lot_ledger cascade;

create view v_ops_lot_ledger
with (security_invoker = true) as
select
  l.id, l.lot_code, l.state, l.origin, l.cultivar,
  coalesce(sup.name, l.supplier_name) as supplier_name,
  l.supplier_id,
  l.is_released, l.released_at, l.coa_ref,
  l.release_status, l.conditional_at, l.conditional_reason, l.customer_acknowledged,
  l.owner_customer_id,
  oc.name as owner_customer_name,
  rb.full_name as released_by,
  cb.full_name as conditional_by,
  m.code as material_code, m.name_fr as material_fr, m.name_en as material_en,
  m.category as material_category, m.is_cannabis,
  l.created_at::date as date_created, l.received_at as date_received, l.produced_at as date_produced,
  coalesce(mv.received_g, 0)  as received_g,
  coalesce(mv.produced_g, 0)  as produced_g,
  coalesce(mv.consumed_g, 0)  as consumed_g,
  coalesce(mv.shipped_g, 0)   as shipped_g,
  coalesce(mv.sampled_g, 0)   as sampled_g,
  coalesce(mv.adjusted_g, 0)  as adjusted_g,
  coalesce(mv.received_g, 0) + coalesce(mv.produced_g, 0) + coalesce(mv.adjusted_g, 0)
    - coalesce(mv.consumed_g, 0) - coalesce(mv.shipped_g, 0) - coalesce(mv.sampled_g, 0)
                              as computed_on_hand_g,
  l.qty_on_hand_g             as recorded_on_hand_g,
  pot.thc_pct, pot.cbd_pct, pot.source as potency_source,
  (select count(*) from ops_lot_links k where k.child_lot_id  = l.id) as parent_count,
  (select count(*) from ops_lot_links k where k.parent_lot_id = l.id) as child_count,
  (select count(*) from ops_lab_samples s
    where s.lot_id = l.id and s.status <> 'cancelled')                as sample_count,
  (select count(*) from ops_lab_samples s
    where s.lot_id = l.id and s.status in ('prepared', 'sent'))       as pending_sample_count,
  (select string_agg(a.external_ref, ', ' order by a.recorded_at)
     from ops_lot_aliases a where a.lot_id = l.id) as external_refs
from ops_lots l
join ops_materials m on m.id = l.material_id
left join ops_suppliers sup on sup.id = l.supplier_id
left join ops_customers oc on oc.id = l.owner_customer_id
left join staff rb on rb.id = l.released_by_staff_id
left join staff cb on cb.id = l.conditional_by_staff_id
left join lateral (
  select
    sum(qty_g) filter (where direction = 'received')   as received_g,
    sum(qty_g) filter (where direction = 'produced')   as produced_g,
    sum(qty_g) filter (where direction = 'consumed')   as consumed_g,
    sum(qty_g) filter (where direction = 'shipped')    as shipped_g,
    sum(qty_g) filter (where direction = 'sample')     as sampled_g,
    sum(qty_g) filter (where direction = 'adjustment') as adjusted_g
  from ops_lot_movements v where v.lot_id = l.id
) mv on true
left join lateral (
  select p.thc_pct, p.cbd_pct, p.source
  from ops_lot_potency p where p.lot_id = l.id
  order by p.recorded_at desc limit 1
) pot on true;

comment on view v_ops_lot_ledger is
  'One row per batch/lot. release_status is batch | conditional | released. owner_customer_name is the tolling customer; supplier_name resolves the picked supplier and falls back to what was typed.';

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
  l.received_at, l.produced_at, l.released_at
from ops_lots l
join ops_materials m      on m.id = l.material_id
join v_ops_lot_ledger led on led.id = l.id
where led.computed_on_hand_g > 0
  and l.state <> 'destroyed';

comment on view v_ops_inventory is
  'Everything with quantity remaining. Sort by material_category, material name, then thc_pct desc. Tolling material appears with its owner.';
