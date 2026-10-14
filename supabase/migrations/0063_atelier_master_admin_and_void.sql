-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 15:56:10 UTC as version 20260928155610
-- ("atelier_master_admin_and_void") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — who may undo something that has already been approved.
--
-- Meissam, 2026-09-28: "only a master admin user that could void or edit something
-- after approval (which in our case will be Stephane as the QAP)."
--
-- Master admin is a separate authority, not another role: Stéphane is QA and needs
-- to stay QA, with this on top. So it is a flag on the person rather than a value
-- in ops_role.
--
-- "Void" is not deletion. A completed thing already moved material, and the ledger
-- is append-only, so voiding writes the reversing entries and marks the record
-- void with a reason. What happened stays visible; what it did is undone.

alter table staff add column if not exists is_master_admin boolean not null default false;

comment on column staff.is_master_admin is
  'May void or amend a record after it has been approved. Held by the QAP; separate from ops_role, which stays functional.';

create or replace function ops_is_master_admin()
returns boolean
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select s.is_master_admin from staff s
      where s.email = auth.jwt() ->> 'email' and s.is_active),
    false
  );
$$;

grant execute on function ops_is_master_admin() to authenticated;

-- Stéphane Paquin, QAP, as Meissam named. Meissam is included too because he is
-- the one exercising the system during the testing phase — easy to revoke in
-- Settings once the team is live.
update staff set is_master_admin = true
 where email in ('stephane@oaziz.ca', 'meissam@oaziz.ca');

-- ============================================================
-- Voiding
-- ============================================================

alter table ops_packaging_runs add column if not exists voided_at          timestamptz;
alter table ops_packaging_runs add column if not exists voided_by_staff_id uuid references staff(id);
alter table ops_packaging_runs add column if not exists void_reason        text;

alter table ops_destructions   add column if not exists voided_at          timestamptz;
alter table ops_destructions   add column if not exists voided_by_staff_id uuid references staff(id);
alter table ops_destructions   add column if not exists void_reason        text;

-- Reverse every movement a completed record wrote, by the note it stamped on them.
-- Each movement gets an equal and opposite adjustment, so the balance returns to
-- where it was and the history shows both the act and its undoing.
create or replace function ops_reverse_movements_by_note(p_note text, p_reason text)
returns int
language plpgsql security invoker set search_path = public as $fn$
declare
  r       record;
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
  v_count int := 0;
begin
  select id into v_actor from staff where email = v_email;

  for r in
    select lot_id, direction, qty_g
    from ops_lot_movements
    where note = p_note
      and direction <> 'adjustment'
  loop
    insert into ops_lot_movements
      (lot_id, direction, qty_g, actor_staff_id, actor_email, note)
    values (
      r.lot_id, 'adjustment',
      -- Reductions come back as a positive adjustment, additions as a negative.
      case when r.direction in ('received', 'produced') then -r.qty_g else r.qty_g end,
      v_actor, v_email,
      'void — ' || p_note || ' — ' || p_reason
    );

    update ops_lots
       set qty_on_hand_g = greatest(
             qty_on_hand_g +
             case when r.direction in ('received', 'produced') then -r.qty_g else r.qty_g end, 0)
     where id = r.lot_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

grant execute on function ops_reverse_movements_by_note(text, text) to authenticated;

create or replace function ops_void_packaging_run(p_run uuid, p_reason text)
returns void
language plpgsql security invoker set search_path = public as $fn$
declare r ops_packaging_runs; v_actor uuid;
begin
  if not ops_is_master_admin() then
    raise exception 'Only a master admin can void a completed packaging run.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to void a packaging run.';
  end if;

  select * into r from ops_packaging_runs where id = p_run for update;
  if r.id is null then raise exception 'Unknown packaging run %', p_run; end if;
  if r.status <> 'done' then
    raise exception 'Only a completed run needs voiding. Cancel it instead.';
  end if;
  if r.voided_at is not null then raise exception 'That run is already void.'; end if;

  perform ops_reverse_movements_by_note('packaging ' || r.run_no, trim(p_reason));

  select id into v_actor from staff where email = auth.jwt() ->> 'email';
  update ops_packaging_runs
     set voided_at = now(), voided_by_staff_id = v_actor, void_reason = trim(p_reason)
   where id = p_run;

  -- The packaged lot it created no longer stands for anything.
  update ops_lots set state = 'destroyed', qty_on_hand_units = 0
   where id = r.output_lot_id;
end;
$fn$;

grant execute on function ops_void_packaging_run(uuid, text) to authenticated;

create or replace function ops_void_destruction(p_destruction uuid, p_reason text)
returns void
language plpgsql security invoker set search_path = public as $fn$
declare d ops_destructions; v_actor uuid;
begin
  if not ops_is_master_admin() then
    raise exception 'Only a master admin can void a recorded destruction.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to void a destruction.';
  end if;

  select * into d from ops_destructions where id = p_destruction for update;
  if d.id is null then raise exception 'Unknown destruction %', p_destruction; end if;
  if d.status <> 'completed' then
    raise exception 'Only a recorded destruction needs voiding. Cancel it instead.';
  end if;
  if d.voided_at is not null then raise exception 'That destruction is already void.'; end if;

  perform ops_reverse_movements_by_note('destruction ' || d.destruction_no, trim(p_reason));

  select id into v_actor from staff where email = auth.jwt() ->> 'email';
  update ops_destructions
     set voided_at = now(), voided_by_staff_id = v_actor, void_reason = trim(p_reason)
   where id = p_destruction;

  -- Lots written off by it come back, unless something else has since destroyed them.
  update ops_lots l set state = 'received'
   where l.id in (select lot_id from ops_destruction_lines where destruction_id = p_destruction)
     and l.state = 'destroyed'
     and (select coalesce(sum(case when direction in ('received','produced','adjustment')
                                   then qty_g else -qty_g end), 0)
          from ops_lot_movements m where m.lot_id = l.id) > 0;
end;
$fn$;

grant execute on function ops_void_destruction(uuid, text) to authenticated;
