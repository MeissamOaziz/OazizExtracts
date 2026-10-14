-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 14:05:25 UTC as version 20260928140525
-- ("atelier_intermediates_and_stage_losses") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — distillate and isolate are pure intermediates, and stage losses reach
-- the ledger.
--
-- Meissam, 2026-09-28, with the CRA guidance: bulk distillate and isolate bought
-- to manufacture other formulations are Pure Intermediates (reported in kg), not
-- Finished Cannabis Extracts (reported in mg of total THC). They only become a
-- finished class once formulated into a product — and in Atelier that formulation
-- already produces a new lot of HASH / ROSIN, whose own material carries the
-- finished class. So the material-level classification is enough; no lot-level
-- override is needed unless Oaziz ever sells an intermediate as a finished good.

update ops_materials
   set excise_class = 'pure_intermediate'
 where code in ('DISTILLATE', 'ISOLATE');

-- ============================================================
-- Stage losses become movements
-- ============================================================

-- Until now a stage wrote one 'consumed' movement per input lot, and the itemised
-- losses lived only in ops_stage_losses — so "quantity incurred as drying or
-- processing loss" and "quantity destroyed" had nothing to draw on.
--
-- The losses are NOT an extra reduction: the grams already left the input lot. So
-- rather than adding movements on top, the amount taken is now SPLIT — the part
-- that became output stays 'consumed', and the rest is written under the direction
-- its reason implies. The two still sum to exactly what was taken, so no balance
-- moves; what changes is that the reduction is now separable by B300 line.
--
-- With several input lots the losses are apportioned pro rata by quantity taken,
-- which is a convention rather than a measurement — the last lot absorbs the
-- rounding so the split ties to the gram.
--
-- Closing inventory is identical either way, which is what makes this safe: the
-- split only decides which reduction line a gram appears on, never the balance.

create or replace function ops_complete_stage(p_stage uuid, p_actual_end date default current_date)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_status   ops_stage_status;
  v_email    text := auth.jwt() ->> 'email';
  v_actor    uuid;
  v_in       numeric;
  v_out      numeric;
  v_loss     numeric;
  r_input    record;
  r_reason   record;
  v_taken    numeric;
  v_split    numeric;
  v_assigned numeric;
  v_running  numeric;
  v_last     boolean;
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
  if v_loss > v_in then
    raise exception 'Recorded losses (%g) exceed what the stage consumed (%g).', v_loss, v_in;
  end if;

  -- 1. what left each input lot, split by where it went
  v_running := 0;
  for r_input in
    select i.lot_id, sum(i.actual_qty_g) as qty
    from ops_stage_inputs i
    where i.stage_id = p_stage and i.lot_id is not null and coalesce(i.actual_qty_g, 0) > 0
    group by i.lot_id
    order by i.lot_id
  loop
    v_taken := r_input.qty;
    v_assigned := 0;
    v_running := v_running + v_taken;
    v_last := (v_running >= v_in);

    for r_reason in
      select l.reason, sum(l.qty_g) as qty
      from ops_stage_losses l
      where l.stage_id = p_stage and coalesce(l.qty_g, 0) > 0
      group by l.reason
      order by l.reason
    loop
      -- Pro rata, except on the last input lot, which takes the remainder so the
      -- apportioned parts add up to the losses actually recorded.
      if v_last then
        v_split := r_reason.qty - coalesce((
          select sum(round(rr.qty * (ii.qty / v_in), 3))
          from (select i2.lot_id, sum(i2.actual_qty_g) qty
                from ops_stage_inputs i2
                where i2.stage_id = p_stage and i2.lot_id is not null
                  and coalesce(i2.actual_qty_g, 0) > 0
                group by i2.lot_id) ii
          cross join (select r_reason.qty as qty) rr
          where ii.lot_id <> r_input.lot_id
        ), 0);
      else
        v_split := round(r_reason.qty * (v_taken / v_in), 3);
      end if;

      if v_split > 0 then
        insert into ops_lot_movements
          (lot_id, direction, qty_g, stage_id, actor_staff_id, actor_email, note)
        values (
          r_input.lot_id,
          case r_reason.reason
            when 'destruction' then 'destroyed'::ops_movement_direction
            when 'sampling'    then 'sample'::ops_movement_direction
            else 'loss'::ops_movement_direction
          end,
          v_split, p_stage, v_actor, v_email,
          'stage completion — ' || r_reason.reason::text
        );
        v_assigned := v_assigned + v_split;
      end if;
    end loop;

    -- whatever actually became output
    if v_taken - v_assigned > 0 then
      insert into ops_lot_movements
        (lot_id, direction, qty_g, stage_id, actor_staff_id, actor_email, note)
      values (r_input.lot_id, 'consumed', v_taken - v_assigned, p_stage,
              v_actor, v_email, 'stage completion');
    end if;
  end loop;

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

  -- 4. running balances — the full amount taken, however it was split
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

comment on function ops_complete_stage(uuid, date) is
  'The only path that writes traceability for a stage. What leaves each input lot is split between consumed, loss, destroyed and sample according to the reasons recorded in ops_stage_losses, so the B300 reduction lines are separable without changing any balance.';
