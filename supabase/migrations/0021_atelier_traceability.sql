-- Atelier — gram-level traceability.
--
-- Meissam, 2026-09-08: "track every single gram", filterable by product, type,
-- lot, the raw material lots inside a formulation, quantities per lot, and the
-- dates of creation, production and sale.
--
-- Two directions have to work:
--   backward — this hash lot is made of WHICH kief, distillate and isolate lots
--   forward  — this trim lot ended up in WHICH finished products, and how many
--              grams of it went into each
--
-- Both fall out of one rule: completing a stage writes the ledger and the
-- parent→child links in the same transaction, so genealogy can never be
-- forgotten or entered inconsistently by hand.

-- ============================================================
-- Lot codes: generated, and immutable once set (0014)
-- ============================================================

create or replace function ops_set_lot_code()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  y text := to_char(now() at time zone 'America/Toronto', 'YYYY');
  prefix text;
  n int;
begin
  if new.lot_code is not null and new.lot_code <> '' then return new; end if;

  select coalesce(m.code, 'LOT') into prefix from ops_materials m where m.id = new.material_id;

  insert into ops_counters (scope, last_value) values ('lot:' || prefix || ':' || y, 1)
  on conflict (scope) do update set last_value = ops_counters.last_value + 1
  returning last_value into n;

  new.lot_code := prefix || '-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$fn$;

revoke execute on function ops_set_lot_code() from public, anon, authenticated;

create trigger ops_lots_set_code
before insert on ops_lots for each row execute function ops_set_lot_code();

-- Sales side of the trace: which lot an order line actually ships.
alter table ops_order_lines add column if not exists lot_id uuid references ops_lots(id);
create index if not exists ops_order_lines_lot_idx on ops_order_lines (lot_id);

-- ============================================================
-- Completing a stage — the one place genealogy is written
-- ============================================================

-- Losses are deliberately NOT written as movements: ops_lot_movements.lot_id is
-- mandatory and a loss belongs to the process, not to a lot. The ledger stays
-- consistent because consumed − produced equals total loss, and ops_stage_losses
-- itemises that difference by reason.
create or replace function ops_complete_stage(p_stage uuid, p_actual_end date default current_date)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_status ops_stage_status;
  v_email  text := auth.jwt() ->> 'email';
  v_actor  uuid;
  v_in     numeric;
  v_out    numeric;
  v_loss   numeric;
begin
  select status into v_status from ops_wo_stages where id = p_stage for update;
  if v_status is null then
    raise exception 'Unknown stage %', p_stage;
  end if;
  if v_status = 'done' then
    raise exception 'This stage is already completed.';
  end if;

  select id into v_actor from staff where email = v_email;

  select coalesce(sum(actual_qty_g), 0) into v_in
    from ops_stage_inputs where stage_id = p_stage;
  select coalesce(sum(actual_qty_g), 0) into v_out
    from ops_stage_outputs where stage_id = p_stage;
  select coalesce(sum(qty_g), 0) into v_loss
    from ops_stage_losses where stage_id = p_stage;

  if v_out > v_in then
    raise exception 'A stage cannot produce more than it consumed (in %g, out %g).', v_in, v_out;
  end if;

  -- 1. consumed
  insert into ops_lot_movements (lot_id, direction, qty_g, stage_id, actor_staff_id, actor_email, note)
  select i.lot_id, 'consumed', i.actual_qty_g, p_stage, v_actor, v_email, 'stage completion'
  from ops_stage_inputs i
  where i.stage_id = p_stage and i.lot_id is not null and coalesce(i.actual_qty_g, 0) > 0;

  -- 2. produced
  insert into ops_lot_movements (lot_id, direction, qty_g, stage_id, actor_staff_id, actor_email, note)
  select o.lot_id, 'produced', o.actual_qty_g, p_stage, v_actor, v_email, 'stage completion'
  from ops_stage_outputs o
  where o.stage_id = p_stage and o.lot_id is not null and coalesce(o.actual_qty_g, 0) > 0;

  -- 3. genealogy: every input lot becomes a parent of every output lot
  insert into ops_lot_links (parent_lot_id, child_lot_id, stage_id)
  select distinct i.lot_id, o.lot_id, p_stage
  from ops_stage_inputs i
  cross join ops_stage_outputs o
  where i.stage_id = p_stage and o.stage_id = p_stage
    and i.lot_id is not null and o.lot_id is not null
    and i.lot_id <> o.lot_id
  on conflict (parent_lot_id, child_lot_id) do nothing;

  -- 4. running balances
  update ops_lots l
     set qty_on_hand_g = greatest(l.qty_on_hand_g - x.qty, 0)
    from (select lot_id, sum(actual_qty_g) qty from ops_stage_inputs
          where stage_id = p_stage and lot_id is not null group by lot_id) x
   where l.id = x.lot_id;

  update ops_lots l
     set qty_on_hand_g = l.qty_on_hand_g + x.qty,
         produced_at   = coalesce(l.produced_at, p_actual_end)
    from (select lot_id, sum(actual_qty_g) qty from ops_stage_outputs
          where stage_id = p_stage and lot_id is not null group by lot_id) x
   where l.id = x.lot_id;

  -- 5. the stage itself
  update ops_wo_stages
     set status = 'done',
         actual_end = coalesce(p_actual_end, current_date),
         actual_start = coalesce(actual_start, planned_start, p_actual_end)
   where id = p_stage;
end;
$fn$;

grant execute on function ops_complete_stage(uuid, date) to authenticated;

-- ============================================================
-- Genealogy walks
-- ============================================================

-- Every lot that flowed INTO this one, at any depth, with the path length.
create or replace function ops_lot_ancestors(p_lot uuid)
returns table (lot_id uuid, depth int)
language sql stable security invoker set search_path = public as $$
  with recursive up(lot_id, depth) as (
    select k.parent_lot_id, 1 from ops_lot_links k where k.child_lot_id = p_lot
    union
    select k.parent_lot_id, u.depth + 1
    from ops_lot_links k join up u on k.child_lot_id = u.lot_id
    where u.depth < 20
  )
  select lot_id, min(depth) from up group by lot_id;
$$;

-- Every lot this one ended up in, at any depth.
create or replace function ops_lot_descendants(p_lot uuid)
returns table (lot_id uuid, depth int)
language sql stable security invoker set search_path = public as $$
  with recursive down(lot_id, depth) as (
    select k.child_lot_id, 1 from ops_lot_links k where k.parent_lot_id = p_lot
    union
    select k.child_lot_id, d.depth + 1
    from ops_lot_links k join down d on k.parent_lot_id = d.lot_id
    where d.depth < 20
  )
  select lot_id, min(depth) from down group by lot_id;
$$;

grant execute on function ops_lot_ancestors(uuid)   to authenticated;
grant execute on function ops_lot_descendants(uuid) to authenticated;

-- ============================================================
-- The report
-- ============================================================

-- One row per lot: what came in, what was consumed, what it became, what is left,
-- and the dates. This is the spine of the traceability report.
create view v_ops_lot_ledger
with (security_invoker = true) as
select
  l.id,
  l.lot_code,
  l.state,
  l.origin,
  l.cultivar,
  l.supplier_name,
  m.code                                   as material_code,
  m.name_fr                                as material_fr,
  m.name_en                                as material_en,
  m.category                               as material_category,
  m.is_cannabis,
  l.created_at::date                       as date_created,
  l.received_at                            as date_received,
  l.produced_at                            as date_produced,
  coalesce(mv.received_g, 0)               as received_g,
  coalesce(mv.produced_g, 0)               as produced_g,
  coalesce(mv.consumed_g, 0)               as consumed_g,
  coalesce(mv.shipped_g, 0)                as shipped_g,
  coalesce(mv.adjusted_g, 0)               as adjusted_g,
  coalesce(mv.received_g, 0) + coalesce(mv.produced_g, 0) + coalesce(mv.adjusted_g, 0)
    - coalesce(mv.consumed_g, 0) - coalesce(mv.shipped_g, 0) as computed_on_hand_g,
  l.qty_on_hand_g                          as recorded_on_hand_g,
  pot.thc_pct,
  pot.cbd_pct,
  pot.source                               as potency_source,
  (select count(*) from ops_lot_links k where k.child_lot_id  = l.id) as parent_count,
  (select count(*) from ops_lot_links k where k.parent_lot_id = l.id) as child_count,
  (select string_agg(a.external_ref, ', ' order by a.recorded_at)
     from ops_lot_aliases a where a.lot_id = l.id)                    as external_refs
from ops_lots l
join ops_materials m on m.id = l.material_id
left join lateral (
  select
    sum(qty_g) filter (where direction = 'received')   as received_g,
    sum(qty_g) filter (where direction = 'produced')   as produced_g,
    sum(qty_g) filter (where direction = 'consumed')   as consumed_g,
    sum(qty_g) filter (where direction = 'shipped')    as shipped_g,
    sum(qty_g) filter (where direction = 'adjustment') as adjusted_g
  from ops_lot_movements v where v.lot_id = l.id
) mv on true
left join lateral (
  select p.thc_pct, p.cbd_pct, p.source
  from ops_lot_potency p where p.lot_id = l.id
  order by p.recorded_at desc limit 1
) pot on true;

comment on view v_ops_lot_ledger is
  'One row per lot with in/out/remaining and dates. computed_on_hand_g comes from the append-only ledger; recorded_on_hand_g is the running column. A gap between them is a reconciliation signal.';

-- Forward trace, one row per (raw lot → finished lot) pair, carrying the grams
-- of the parent that entered the child at that step. This is the "how much of
-- THIS trim ended up in THAT product" answer.
create view v_ops_lot_flow
with (security_invoker = true) as
select
  k.parent_lot_id,
  pl.lot_code                as parent_lot_code,
  pm.code                    as parent_material,
  pm.category                as parent_category,
  k.child_lot_id,
  cl.lot_code                as child_lot_code,
  cm.code                    as child_material,
  cm.category                as child_category,
  k.stage_id,
  s.actual_end               as date_produced,
  pt.code                    as process_code,
  w.wo_no,
  o.order_no,
  o.customer_po_ref,
  cust.name                  as customer_name,
  si.qty_in_g,
  so.qty_out_g
from ops_lot_links k
join ops_lots pl      on pl.id = k.parent_lot_id
join ops_materials pm on pm.id = pl.material_id
join ops_lots cl      on cl.id = k.child_lot_id
join ops_materials cm on cm.id = cl.material_id
left join ops_wo_stages s     on s.id = k.stage_id
left join ops_process_types pt on pt.id = s.process_type_id
left join ops_work_orders w   on w.id = s.work_order_id
left join ops_orders o        on o.id = w.order_id
left join ops_customers cust  on cust.id = o.customer_id
left join lateral (
  select sum(actual_qty_g) as qty_in_g from ops_stage_inputs i
  where i.stage_id = k.stage_id and i.lot_id = k.parent_lot_id
) si on true
left join lateral (
  select sum(actual_qty_g) as qty_out_g from ops_stage_outputs ou
  where ou.stage_id = k.stage_id and ou.lot_id = k.child_lot_id
) so on true;

comment on view v_ops_lot_flow is
  'Forward/backward trace edges with the grams that moved. Join repeatedly, or use ops_lot_ancestors / ops_lot_descendants for the full depth.';

-- Sales side: every order line that carries a lot, with its dates.
create view v_ops_lot_sales
with (security_invoker = true) as
select
  ol.lot_id,
  l.lot_code,
  m.code                as material_code,
  ol.product_name,
  p.product_type,
  p.brand,
  ol.qty                as qty_sold,
  ol.uom,
  ol.unit_price,
  o.currency,
  o.id                  as order_id,
  o.order_no,
  o.customer_po_ref,
  c.name                as customer_name,
  o.order_date          as date_ordered,
  o.status              as order_status,
  o.requested_delivery_date
from ops_order_lines ol
join ops_orders o      on o.id = ol.order_id
left join ops_lots l   on l.id = ol.lot_id
left join ops_materials m on m.id = l.material_id
left join ops_products p  on p.id = ol.product_id
left join ops_customers c on c.id = o.customer_id
where ol.lot_id is not null;

comment on view v_ops_lot_sales is
  'Which lot was sold, to whom, when and for how much. Shipment dates join on in phase 5.';
