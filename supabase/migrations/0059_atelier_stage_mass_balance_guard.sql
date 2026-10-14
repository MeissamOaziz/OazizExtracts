-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 14:06:39 UTC as version 20260928140639
-- ("atelier_stage_mass_balance_guard") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — a stage cannot account for more than it consumed.
--
-- Found while testing the loss split: the existing guards checked output alone and
-- losses alone against the input, so a stage could record 1 900 g of output PLUS
-- 8 101 g of losses out of 10 000 g of input and be accepted, which is a gram of
-- material conjured out of nothing. Mass balance is output + losses <= input, and
-- that is the check that belongs here.

create or replace function ops_stage_check_balance()
returns trigger language plpgsql security invoker set search_path = public as $fn$
begin
  return new;
end;
$fn$;

drop function if exists ops_stage_check_balance();

-- Patch the guard into the completion path itself, where the numbers are final.
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
  -- Output and losses together are everything the input became. More than the
  -- input went in is material that did not exist.
  if v_out + v_loss > v_in then
    raise exception 'Output (%g) and losses (%g) come to %g, which is more than the %g consumed. Check the numbers before completing.',
      v_out, v_loss, v_out + v_loss, v_in;
  end if;

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
      if v_last then
        v_split := r_reason.qty - coalesce((
          select sum(round(r_reason.qty * (ii.qty / v_in), 3))
          from (select i2.lot_id, sum(i2.actual_qty_g) qty
                from ops_stage_inputs i2
                where i2.stage_id = p_stage and i2.lot_id is not null
                  and coalesce(i2.actual_qty_g, 0) > 0
                group by i2.lot_id) ii
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

    if v_taken - v_assigned > 0 then
      insert into ops_lot_movements
        (lot_id, direction, qty_g, stage_id, actor_staff_id, actor_email, note)
      values (r_input.lot_id, 'consumed', v_taken - v_assigned, p_stage,
              v_actor, v_email, 'stage completion');
    end if;
  end loop;

  insert into ops_lot_movements (lot_id, direction, qty_g, stage_id, actor_staff_id, actor_email, note)
  select o.lot_id, 'produced', o.actual_qty_g, p_stage, v_actor, v_email, 'stage completion'
  from ops_stage_outputs o
  where o.stage_id = p_stage and o.lot_id is not null and coalesce(o.actual_qty_g, 0) > 0;

  insert into ops_lot_links (parent_lot_id, child_lot_id, stage_id)
  select distinct i.lot_id, o.lot_id, p_stage
  from ops_stage_inputs i
  cross join ops_stage_outputs o
  where i.stage_id = p_stage and o.stage_id = p_stage
    and i.lot_id is not null and o.lot_id is not null
    and i.lot_id <> o.lot_id
  on conflict (parent_lot_id, child_lot_id) do nothing;

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

  update ops_wo_stages
     set status = 'done',
         actual_end = coalesce(p_actual_end, current_date),
         actual_start = coalesce(actual_start, planned_start, p_actual_end)
   where id = p_stage;
end;
$fn$;

grant execute on function ops_complete_stage(uuid, date) to authenticated;

comment on function ops_complete_stage(uuid, date) is
  'The only path that writes traceability for a stage. Refuses unless output + losses <= input. What leaves each input lot is split between consumed, loss, destroyed and sample according to the reasons recorded in ops_stage_losses, so the B300 reduction lines are separable without changing any balance.';
