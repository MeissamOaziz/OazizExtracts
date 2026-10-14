-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 14:08:12 UTC as version 20260928140812
-- ("atelier_destruction_module") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — destruction as a recorded event, not an adjustment.
--
-- Two regulators want this and they want different things from it. The CRA B300
-- reports "quantity destroyed" as its own reduction line. Health Canada wants the
-- record behind it: what was destroyed, how much, by what method, on what date, in
-- whose presence, and an attestation from those witnesses — kept for the retention
-- period whether or not anyone ever asks.
--
-- So destruction is a document with a number, not a quantity adjustment with a
-- note. It is planned first, witnessed and attested second, and only then does it
-- move any material — which is also the order it happens in on the floor.

create type ops_destruction_status as enum ('planned', 'completed', 'cancelled');

create type ops_destruction_method as enum (
  'incineration',
  'chemical_denaturing',   -- rendered unusable by additive, then landfilled
  'composting',
  'shredding_and_landfill',
  'third_party',           -- handed to a licensed disposal contractor
  'other'
);

-- ============================================================
-- Numbering — DES-<year>-<0001>
-- ============================================================

create or replace function ops_set_destruction_no()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  y text := to_char(now() at time zone 'America/Toronto', 'YYYY');
  n int;
begin
  if new.destruction_no is not null and new.destruction_no <> '' then return new; end if;
  insert into ops_counters (scope, last_value) values ('des:' || y, 1)
  on conflict (scope) do update set last_value = ops_counters.last_value + 1
  returning last_value into n;
  new.destruction_no := 'DES-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$fn$;

revoke execute on function ops_set_destruction_no() from public, anon, authenticated;

-- ============================================================
-- The destruction record
-- ============================================================

create table ops_destructions (
  id                uuid primary key default gen_random_uuid(),
  destruction_no    text not null unique,
  status            ops_destruction_status not null default 'planned',

  method            ops_destruction_method not null,
  method_detail     text,
  -- Why it is being destroyed. Health Canada expects a reason, and "failed QA" and
  -- "expired" are not the same story.
  reason            text not null,
  planned_for       date,
  destroyed_on      date,

  -- Who did it and who watched. Health Canada requires at least two witnesses, one
  -- of whom is not involved in the destruction itself.
  performed_by_staff_id  uuid references staff(id),
  witness_1_staff_id     uuid references staff(id),
  witness_2_staff_id     uuid references staff(id),
  witness_1_name         text,
  witness_2_name         text,
  -- The attestation the witnesses sign: that they observed it and that the record
  -- is accurate. Stored as the text they agreed to, plus who agreed and when.
  attestation_text       text,
  attested_at            timestamptz,

  -- QA approves a destruction before it happens.
  approved_by_staff_id   uuid references staff(id),
  approved_at            timestamptz,

  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger ops_destructions_no
before insert on ops_destructions
for each row execute function ops_set_destruction_no();

create trigger ops_destructions_touch_updated_at
before update on ops_destructions
for each row execute function touch_updated_at();

comment on table ops_destructions is
  'One destruction event, covering one or more lots. Planned, QA-approved, then witnessed and attested. Completing it is the only thing that writes the destroyed movements.';

-- What is being destroyed. A single event usually covers several lots.
create table ops_destruction_lines (
  id              uuid primary key default gen_random_uuid(),
  destruction_id  uuid not null references ops_destructions(id) on delete cascade,
  lot_id          uuid not null references ops_lots(id),
  qty_g           numeric(14,3) not null check (qty_g > 0),
  -- Packaged goods are destroyed as units as well as grams.
  units           int,
  notes           text,
  unique (destruction_id, lot_id)
);

create index ops_destruction_lines_lot_idx on ops_destruction_lines (lot_id);

comment on table ops_destruction_lines is
  'The lots and quantities in a destruction event. Until the event completes these are an intention, not a movement.';

alter table ops_destructions       enable row level security;
alter table ops_destruction_lines  enable row level security;

create policy ops_destructions_read on ops_destructions
  for select to authenticated using (true);
create policy ops_destruction_lines_read on ops_destruction_lines
  for select to authenticated using (true);

-- Anyone with a role can plan one; approving and completing are gated in the
-- functions, where the QA rule can actually be expressed.
create policy ops_destructions_write on ops_destructions
  for all to authenticated
  using (ops_current_role() is not null) with check (ops_current_role() is not null);
create policy ops_destruction_lines_write on ops_destruction_lines
  for all to authenticated
  using (ops_current_role() is not null) with check (ops_current_role() is not null);

-- ============================================================
-- QA approval
-- ============================================================

create or replace function ops_approve_destruction(p_destruction uuid)
returns void
language plpgsql security invoker set search_path = public
as $fn$
declare
  v_email  text := auth.jwt() ->> 'email';
  v_actor  uuid;
  v_status ops_destruction_status;
  v_lines  int;
begin
  if ops_current_role() not in ('qa', 'admin') then
    raise exception 'Only QA can approve a destruction.';
  end if;

  select status into v_status from ops_destructions where id = p_destruction for update;
  if v_status is null then raise exception 'Unknown destruction %', p_destruction; end if;
  if v_status <> 'planned' then
    raise exception 'Only a planned destruction can be approved.';
  end if;

  select count(*) into v_lines from ops_destruction_lines where destruction_id = p_destruction;
  if v_lines = 0 then
    raise exception 'Add at least one lot before approving the destruction.';
  end if;

  select id into v_actor from staff where email = v_email;

  update ops_destructions
     set approved_by_staff_id = v_actor, approved_at = now()
   where id = p_destruction;
end;
$fn$;

grant execute on function ops_approve_destruction(uuid) to authenticated;

-- ============================================================
-- Completing it — the only path that moves material
-- ============================================================

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

  -- Health Canada wants two witnesses to the act, and their attestation.
  if v_w1 is null or v_w2 is null then
    raise exception 'Two witnesses are required, and both have to be named on the record.';
  end if;
  if nullif(trim(coalesce(coalesce(p_attestation, d.attestation_text), '')), '') is null then
    raise exception 'The witnessesّ attestation is required before the destruction can be recorded.';
  end if;

  select id into v_actor from staff where email = v_email;

  -- Nothing may be destroyed that is not actually there.
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

  -- A lot destroyed down to nothing leaves inventory for good.
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

create or replace function ops_cancel_destruction(p_destruction uuid, p_reason text)
returns void
language plpgsql security invoker set search_path = public
as $fn$
declare v_status ops_destruction_status;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to cancel a destruction.';
  end if;
  select status into v_status from ops_destructions where id = p_destruction for update;
  if v_status is null then raise exception 'Unknown destruction %', p_destruction; end if;
  if v_status = 'completed' then
    raise exception 'That destruction has been carried out. Adjust the lots instead, so the record stays intact.';
  end if;
  update ops_destructions
     set status = 'cancelled',
         notes = concat_ws(E'\n', notes, 'Cancelled: ' || trim(p_reason))
   where id = p_destruction;
end;
$fn$;

grant execute on function ops_cancel_destruction(uuid, text) to authenticated;

-- ============================================================
-- Reading
-- ============================================================

create view v_ops_destructions
with (security_invoker = true) as
select
  d.id, d.destruction_no, d.status, d.method, d.method_detail, d.reason,
  d.planned_for, d.destroyed_on,
  d.witness_1_name, d.witness_2_name, d.attestation_text, d.attested_at,
  d.approved_at, d.notes, d.created_at,
  pb.full_name as performed_by,
  ab.full_name as approved_by,
  (select count(*) from ops_destruction_lines dl where dl.destruction_id = d.id) as lot_count,
  (select coalesce(sum(dl.qty_g), 0) from ops_destruction_lines dl where dl.destruction_id = d.id) as total_g,
  (select coalesce(sum(dl.units), 0) from ops_destruction_lines dl where dl.destruction_id = d.id) as total_units
from ops_destructions d
left join staff pb on pb.id = d.performed_by_staff_id
left join staff ab on ab.id = d.approved_by_staff_id;

comment on view v_ops_destructions is
  'Destruction events with their witnesses, approval and totals. The lines behind each one are in ops_destruction_lines.';
