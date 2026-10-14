-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 13:06:13 UTC as version 20260928130613
-- ("atelier_ledger_counts_loss_and_destruction") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — loss and destruction must reduce the balance.
--
-- ops_movement_direction has carried 'loss' and 'destroyed' since 0014, but
-- v_ops_lot_ledger never summed them, so a lot's computed_on_hand_g would have
-- ignored both — overstating stock. Worse, ops_complete_packaging_run() computes
-- on hand with "everything that is not received/produced/adjustment subtracts",
-- so the two would have disagreed about the same lot.
--
-- No such movement exists yet, so this corrects the rule before it can be wrong
-- in the data. It also matters for the B300: "quantity incurred as drying or
-- processing loss" and "quantity destroyed" are separate reported lines, so they
-- have to be separate columns here rather than folded into adjustments.

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
  coalesce(mv.loss_g, 0)      as loss_g,
  coalesce(mv.destroyed_g, 0) as destroyed_g,
  coalesce(mv.adjusted_g, 0)  as adjusted_g,
  coalesce(mv.received_g, 0) + coalesce(mv.produced_g, 0) + coalesce(mv.adjusted_g, 0)
    - coalesce(mv.consumed_g, 0) - coalesce(mv.shipped_g, 0) - coalesce(mv.sampled_g, 0)
    - coalesce(mv.loss_g, 0)   - coalesce(mv.destroyed_g, 0)
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
    sum(qty_g) filter (where direction = 'loss')       as loss_g,
    sum(qty_g) filter (where direction = 'destroyed')  as destroyed_g,
    sum(qty_g) filter (where direction = 'adjustment') as adjusted_g
  from ops_lot_movements v where v.lot_id = l.id
) mv on true
left join lateral (
  select p.thc_pct, p.cbd_pct, p.source
  from ops_lot_potency p where p.lot_id = l.id
  order by p.recorded_at desc limit 1
) pot on true;

comment on view v_ops_lot_ledger is
  'One row per batch/lot. release_status is batch | conditional | released. Loss and destruction reduce the balance and are reported separately, because the B300 asks for them on their own lines.';

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
