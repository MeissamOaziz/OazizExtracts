-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 14:08:44 UTC as version 20260928140844
-- ("atelier_fix_destruction_message_typo") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- A stray character had crept into the attestation message. These strings are read
-- by whoever is standing at the destruction, so they have to be clean.
create or replace function ops_complete_destruction(
  p_destruction     uuid,
  p_destroyed_on    date default current_date,
  p_witness_1_name  text default null,
  p_witness_2_name  text default null,
  p_attestation     text default null
)
returns void
language plpgsql security invoker set search_path = public
as $fn$
declare
  d        ops_destructions;
  v_email  text := auth.jwt() ->> 'email';
  v_actor  uuid;
  r        record;
  v_hand   numeric;
  v_w1     text;
  v_w2     text;
begin
  select * into d from ops_destructions where id = p_destruction for update;
  if d.id is null then raise exception 'Unknown destruction %', p_destruction; end if;
  if d.status = 'completed' then raise exception 'That destruction is already recorded.'; end if;
  if d.status = 'cancelled' then raise exception 'That destruction was cancelled.'; end if;
  if d.approved_at is null then
    raise exception 'QA has to approve this destruction before it is carried out.';
  end if;

  v_w1 := coalesce(nullif(trim(coalesce(p_witness_1_name, '')), ''), d.witness_1_name);
  v_w2 := coalesce(nullif(trim(coalesce(p_witness_2_name, '')), ''), d.witness_2_name);

  if v_w1 is null or v_w2 is null then
    raise exception 'Two witnesses are required, and both have to be named on the record.';
  end if;
  if nullif(trim(coalesce(coalesce(p_attestation, d.attestation_text), '')), '') is null then
    raise exception 'The attestation from the witnesses is required before the destruction can be recorded.';
  end if;

  select id into v_actor from staff where email = v_email;

  for r in
    select dl.lot_id, dl.qty_g, dl.units, l.lot_code
    from ops_destruction_lines dl join ops_lots l on l.id = dl.lot_id
    where dl.destruction_id = p_destruction
  loop
    select coalesce(sum(case when direction in ('received','produced','adjustment')
                             then qty_g else -qty_g end), 0)
      into v_hand
      from ops_lot_movements where lot_id = r.lot_id;

    if r.qty_g > v_hand then
      raise exception 'Only %g of % is on hand; the destruction records %g.',
        v_hand, r.lot_code, r.qty_g;
    end if;

    insert into ops_lot_movements
      (lot_id, direction, qty_g, actor_staff_id, actor_email, occurred_at, note)
    values (
      r.lot_id, 'destroyed', r.qty_g, v_actor, v_email,
      (coalesce(p_destroyed_on, current_date)::timestamp) at time zone 'America/Toronto',
      'destruction ' || d.destruction_no
    );

    update ops_lots
       set qty_on_hand_g     = greatest(qty_on_hand_g - r.qty_g, 0),
           qty_on_hand_units = greatest(coalesce(qty_on_hand_units, 0) - coalesce(r.units, 0), 0)
     where id = r.lot_id;
  end loop;

  update ops_lots l
     set state = 'destroyed'
   where l.id in (select lot_id from ops_destruction_lines where destruction_id = p_destruction)
     and (select coalesce(sum(case when direction in ('received','produced','adjustment')
                                   then qty_g else -qty_g end), 0)
          from ops_lot_movements m where m.lot_id = l.id) <= 0;

  update ops_destructions
     set status                = 'completed',
         destroyed_on          = coalesce(p_destroyed_on, current_date),
         witness_1_name        = v_w1,
         witness_2_name        = v_w2,
         attestation_text      = coalesce(p_attestation, attestation_text),
         attested_at           = now(),
         performed_by_staff_id = coalesce(performed_by_staff_id, v_actor)
   where id = p_destruction;
end;
$fn$;

grant execute on function ops_complete_destruction(uuid, date, text, text, text) to authenticated;
