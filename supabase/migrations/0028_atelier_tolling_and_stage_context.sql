-- Atelier — tolling ownership, and order context on the planning views.
--
-- Meissam, 2026-09-22:
--   1. Two new lot origins: material supplied by a customer for tolling, and the
--      "supplier special" arrangement where the trim is paid for out of the sale.
--   2. "In both the Gantt and Calendar views I need to be able to see the customer
--      name / PO name … or mark it as INTERNAL REQUEST, so we can see what process
--      is for what exactly."
--
-- The enum values themselves are added in 0027.

-- ============================================================
-- Who the material belongs to
-- ============================================================

-- For tolling and supplier-special lots the material is on our floor but is not
-- unconditionally ours. Recording whose it is keeps that visible on the lot, in
-- inventory, and in any trace that reaches it.
alter table ops_lots add column if not exists owner_customer_id uuid references ops_customers(id);
create index if not exists ops_lots_owner_idx on ops_lots (owner_customer_id);

comment on column ops_lots.owner_customer_id is
  'Set for customer_supplied (tolling) and supplier_special lots: the counterparty whose material this is, or who is owed on it once the output sells.';

-- Receiving gains the owner, so a tolling lot can be booked in one step.
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
  p_owner_customer_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_lot   uuid;
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
  v_when  timestamptz;
begin
  if p_material_id is null then
    raise exception 'A material is required to receive a lot.';
  end if;
  if p_qty_g is null or p_qty_g <= 0 then
    raise exception 'Received quantity must be greater than zero.';
  end if;

  -- Tolling and supplier-special material belongs to someone: say who.
  if p_origin in ('customer_supplied', 'supplier_special') and p_owner_customer_id is null then
    raise exception 'Material supplied by a customer, or under a supplier-special arrangement, needs the counterparty recorded.';
  end if;

  select id into v_actor from staff where email = v_email;

  v_when := (coalesce(p_received_at, current_date)::timestamp) at time zone 'America/Toronto';

  insert into ops_lots (
    lot_code, material_id, state, origin, cultivar, supplier_name,
    received_at, qty_on_hand_g, notes, created_by, owner_customer_id
  ) values (
    nullif(trim(coalesce(p_lot_code, '')), ''),
    p_material_id, 'received', p_origin, p_cultivar, p_supplier,
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
  numeric, numeric, ops_potency_source, text, date, text, text, text, uuid
) to authenticated;

-- ============================================================
-- Order context on every stage
-- ============================================================

-- The planning views group by work order or by room, so each stage needs to
-- carry enough of its order to be identified at a glance: the customer when
-- there is one, and otherwise what kind of internal job it is.
drop view if exists v_ops_stages;

create view v_ops_stages
with (security_invoker = true) as
select
  s.id, s.work_order_id, s.seq, s.status,
  s.planned_start, s.planned_end, s.actual_start, s.actual_end,
  s.assignee_staff_id, s.expected_yield_pct, s.notes,
  coalesce(s.label, pt.name_fr) as label_fr,
  coalesce(s.label, pt.name_en) as label_en,
  pt.id as process_type_id, pt.code as process_code, pt.kind as process_kind, pt.is_formulation,
  r.id as room_id, r.code as room_code, r.colour as room_colour, r.allows_concurrent,
  w.wo_no,
  o.id as order_id, o.order_no, o.customer_po_ref, o.on_hold as order_on_hold,
  o.source as order_source,
  c.name as customer_name,
  (o.on_hold or exists (
     select 1 from ops_stage_deps d
     join ops_wo_stages p on p.id = d.depends_on_stage_id
     where d.stage_id = s.id and p.status not in ('done', 'skipped', 'cancelled')
  )) as is_blocked,
  (select count(*) from ops_stage_deps d where d.stage_id = s.id) as dep_count
from ops_wo_stages s
join ops_work_orders w    on w.id = s.work_order_id
join ops_orders o         on o.id = w.order_id
join ops_process_types pt on pt.id = s.process_type_id
left join ops_rooms r     on r.id = s.room_id
left join ops_customers c on c.id = o.customer_id;

comment on view v_ops_stages is
  'One row per stage with room colour, order context (customer, PO, source) and computed blocked flag. security_invoker so RLS on the base tables still applies.';

-- ============================================================
-- Owner surfaced on the lot views
-- ============================================================

drop view if exists v_ops_inventory;
drop view if exists v_ops_lot_ledger cascade;

create view v_ops_lot_ledger
with (security_invoker = true) as
select
  l.id, l.lot_code, l.state, l.origin, l.cultivar, l.supplier_name,
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
  'One row per batch/lot. release_status is batch | conditional | released. owner_customer_name is set for tolling and supplier-special material.';

create view v_ops_inventory
with (security_invoker = true) as
select
  l.id, l.lot_code, l.is_released, l.release_status, l.state,
  l.cultivar, l.supplier_name, l.coa_ref, l.conditional_at,
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
