-- Atelier phase 3 — stage plans, dependencies, and the movement ledger in use.
--
-- A stage is where the formulation model from phase 1 finally does work:
--   inputs  (N rows) → the stage → outputs (N rows) + losses (N rows)
-- so merging several kief lots plus a distillate is ONE stage with five input
-- rows, and inputs − outputs − losses is a checkable mass balance.
--
-- Blocked is DERIVED, never stored: a stage is blocked when a predecessor is
-- unfinished or a QA hold covers its order. Storing it would go stale the moment
-- a hold is lifted somewhere else.

create type ops_stage_status as enum (
  'planned', 'in_progress', 'done', 'skipped', 'cancelled'
);

-- ============================================================
-- Stages
-- ============================================================

create table ops_wo_stages (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references ops_work_orders(id) on delete cascade,
  seq               int not null,
  process_type_id   uuid not null references ops_process_types(id),
  -- Copied from the process type at plan time, then overridable: moving one job
  -- to another room must not rewrite the catalogue.
  room_id           uuid references ops_rooms(id),
  label             text,

  planned_start     date,
  planned_end       date,
  actual_start      date,
  actual_end        date,

  assignee_staff_id uuid references staff(id),
  status            ops_stage_status not null default 'planned',

  expected_yield_pct numeric(5,2),
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint ops_wo_stages_dates_ordered
    check (planned_end is null or planned_start is null or planned_end >= planned_start),
  unique (work_order_id, seq)
);

create index ops_wo_stages_wo_idx     on ops_wo_stages (work_order_id, seq);
create index ops_wo_stages_room_idx   on ops_wo_stages (room_id, planned_start);
create index ops_wo_stages_status_idx on ops_wo_stages (status);

create trigger ops_wo_stages_touch_updated_at
before update on ops_wo_stages for each row execute function touch_updated_at();

-- ============================================================
-- Dependencies — "hash only after kief"
-- ============================================================

create table ops_stage_deps (
  id                  uuid primary key default gen_random_uuid(),
  stage_id            uuid not null references ops_wo_stages(id) on delete cascade,
  depends_on_stage_id uuid not null references ops_wo_stages(id) on delete cascade,
  dep_type            text not null default 'finish_to_start',
  unique (stage_id, depends_on_stage_id),
  constraint ops_stage_deps_no_self check (stage_id <> depends_on_stage_id)
);

create index ops_stage_deps_stage_idx on ops_stage_deps (stage_id);
create index ops_stage_deps_pred_idx  on ops_stage_deps (depends_on_stage_id);

-- Reject a dependency that would close a loop. Without this a cycle makes the
-- projected-completion walk non-terminating.
create or replace function ops_stage_deps_no_cycle()
returns trigger language plpgsql set search_path = public as $fn$
declare looped boolean;
begin
  with recursive chain(id) as (
    select new.stage_id
    union
    select d.stage_id from ops_stage_deps d join chain c on d.depends_on_stage_id = c.id
  )
  select exists (select 1 from chain where id = new.depends_on_stage_id) into looped;

  if looped then
    raise exception 'That dependency would create a cycle between stages.';
  end if;
  return new;
end;
$fn$;

create trigger ops_stage_deps_no_cycle_bi
before insert or update on ops_stage_deps
for each row execute function ops_stage_deps_no_cycle();

-- ============================================================
-- Inputs, outputs, losses — the formulation model
-- ============================================================

create table ops_stage_inputs (
  id             uuid primary key default gen_random_uuid(),
  stage_id       uuid not null references ops_wo_stages(id) on delete cascade,
  lot_id         uuid references ops_lots(id),
  -- Free text so a lot GrowerIQ has not caught up on can still be recorded.
  lot_ref        text,
  material_id    uuid references ops_materials(id),
  planned_qty_g  numeric(14,3),
  actual_qty_g   numeric(14,3),
  proportion_pct numeric(6,3),
  notes          text
);
create index ops_stage_inputs_stage_idx on ops_stage_inputs (stage_id);

create table ops_stage_outputs (
  id             uuid primary key default gen_random_uuid(),
  stage_id       uuid not null references ops_wo_stages(id) on delete cascade,
  lot_id         uuid references ops_lots(id),
  lot_ref        text,
  material_id    uuid references ops_materials(id),
  planned_qty_g  numeric(14,3),
  actual_qty_g   numeric(14,3),
  notes          text
);
create index ops_stage_outputs_stage_idx on ops_stage_outputs (stage_id);

create table ops_stage_losses (
  id           uuid primary key default gen_random_uuid(),
  stage_id     uuid not null references ops_wo_stages(id) on delete cascade,
  qty_g        numeric(14,3) not null,
  reason       ops_loss_reason not null default 'process_waste',
  note         text,
  recorded_at  timestamptz not null default now()
);
create index ops_stage_losses_stage_idx on ops_stage_losses (stage_id);

-- ============================================================
-- Derived helpers
-- ============================================================

-- Mass balance for one stage: in − out − loss. Zero (within tolerance) is right.
create or replace function ops_stage_balance_g(p_stage uuid)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select sum(coalesce(actual_qty_g, 0)) from ops_stage_inputs  where stage_id = p_stage), 0)
       - coalesce((select sum(coalesce(actual_qty_g, 0)) from ops_stage_outputs where stage_id = p_stage), 0)
       - coalesce((select sum(qty_g)                     from ops_stage_losses  where stage_id = p_stage), 0);
$$;

-- Mass-weighted blended potency of a stage's inputs — what the output lot should
-- test at, pending a real COA.
create or replace function ops_stage_blended_thc_pct(p_stage uuid)
returns numeric language sql stable set search_path = public as $$
  with latest as (
    select distinct on (p.lot_id) p.lot_id, p.thc_pct
    from ops_lot_potency p
    order by p.lot_id, p.recorded_at desc
  )
  select case when sum(i.actual_qty_g) > 0
              then round(sum(i.actual_qty_g * coalesce(l.thc_pct, 0)) / sum(i.actual_qty_g), 3)
         end
  from ops_stage_inputs i
  left join latest l on l.lot_id = i.lot_id
  where i.stage_id = p_stage and i.actual_qty_g is not null;
$$;

-- Keep the work order's projected completion and at-risk flag in step with its
-- stages, so lists and boards need no recomputation.
create or replace function ops_wo_refresh_projection(p_wo uuid)
returns void language plpgsql set search_path = public as $fn$
declare proj date; promised date;
begin
  select max(coalesce(actual_end, planned_end)) into proj
  from ops_wo_stages
  where work_order_id = p_wo and status not in ('cancelled', 'skipped');

  select w.promised_date into promised from ops_work_orders w where w.id = p_wo;

  update ops_work_orders
     set projected_completion = proj,
         at_risk = (proj is not null and promised is not null and proj > promised)
   where id = p_wo;
end;
$fn$;

create or replace function ops_wo_stages_sync_projection()
returns trigger language plpgsql set search_path = public as $fn$
begin
  perform ops_wo_refresh_projection(coalesce(new.work_order_id, old.work_order_id));
  return null;
end;
$fn$;

create trigger ops_wo_stages_projection_aiud
after insert or update or delete on ops_wo_stages
for each row execute function ops_wo_stages_sync_projection();

-- ============================================================
-- Board view — blocked is computed here, never stored
-- ============================================================

create view v_ops_stages
with (security_invoker = true) as
select
  s.id,
  s.work_order_id,
  s.seq,
  s.status,
  s.planned_start,
  s.planned_end,
  s.actual_start,
  s.actual_end,
  s.assignee_staff_id,
  s.expected_yield_pct,
  s.notes,
  coalesce(s.label, pt.name_fr)          as label_fr,
  coalesce(s.label, pt.name_en)          as label_en,
  pt.id                                   as process_type_id,
  pt.code                                 as process_code,
  pt.kind                                 as process_kind,
  pt.is_formulation,
  r.id                                    as room_id,
  r.code                                  as room_code,
  r.colour                                as room_colour,
  r.allows_concurrent,
  w.wo_no,
  o.id                                    as order_id,
  o.order_no,
  o.customer_po_ref,
  o.on_hold                               as order_on_hold,
  c.name                                  as customer_name,
  -- Blocked: an unfinished predecessor, or a QA hold on the order.
  (o.on_hold or exists (
     select 1
     from ops_stage_deps d
     join ops_wo_stages p on p.id = d.depends_on_stage_id
     where d.stage_id = s.id and p.status not in ('done', 'skipped', 'cancelled')
  ))                                      as is_blocked,
  (select count(*) from ops_stage_deps d where d.stage_id = s.id) as dep_count
from ops_wo_stages s
join ops_work_orders w   on w.id = s.work_order_id
join ops_orders o        on o.id = w.order_id
join ops_process_types pt on pt.id = s.process_type_id
left join ops_rooms r     on r.id = s.room_id
left join ops_customers c on c.id = o.customer_id;

comment on view v_ops_stages is
  'One row per stage with its room colour, order context and computed blocked flag. security_invoker so RLS on the base tables still applies.';

-- Same-room overlaps, for the advisory badge. Rooms flagged allows_concurrent
-- (Room C: drying + pressing) are excluded — they overlap by design.
create view v_ops_room_conflicts
with (security_invoker = true) as
select
  a.id            as stage_id,
  b.id            as other_stage_id,
  a.room_id,
  r.code          as room_code,
  greatest(a.planned_start, b.planned_start) as overlap_start,
  least(a.planned_end, b.planned_end)        as overlap_end
from ops_wo_stages a
join ops_wo_stages b
  on a.room_id = b.room_id
 and a.id <> b.id
 and a.planned_start <= b.planned_end
 and b.planned_start <= a.planned_end
join ops_rooms r on r.id = a.room_id
where r.allows_concurrent = false
  and a.status not in ('done', 'cancelled', 'skipped')
  and b.status not in ('done', 'cancelled', 'skipped')
  and a.planned_start is not null and a.planned_end is not null
  and b.planned_start is not null and b.planned_end is not null;

comment on view v_ops_room_conflicts is
  'Advisory only. Room C allows concurrent stages by design and is excluded. Nothing in the app blocks a schedule on this — production keeps the judgement call.';

-- ============================================================
-- Row Level Security
-- ============================================================

alter table ops_wo_stages     enable row level security;
alter table ops_stage_deps    enable row level security;
alter table ops_stage_inputs  enable row level security;
alter table ops_stage_outputs enable row level security;
alter table ops_stage_losses  enable row level security;

do $do$
declare t text;
begin
  foreach t in array array[
    'ops_wo_stages','ops_stage_deps','ops_stage_inputs','ops_stage_outputs','ops_stage_losses'
  ] loop
    execute format('create policy %I on %I for select to authenticated using (true)',
                   t || '_read_authenticated', t);
    execute format('create policy %I on %I for all to authenticated
                      using (ops_current_role() is not null)
                      with check (ops_current_role() is not null)',
                   t || '_write', t);
  end loop;
end $do$;
