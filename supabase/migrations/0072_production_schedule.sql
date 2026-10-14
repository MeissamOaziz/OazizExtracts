-- Production scheduling (Planification de production): a standalone module,
-- separate from the Atelier, where the production lead records what runs in
-- which room and when. GrowerIQ stays the system of record for lots and
-- batches; we only carry their IDs so a task can be found there.
--
-- Every save writes exactly one row to an append-only event log. A save that
-- moves the schedule (dates or room), pauses or cancels a task must carry a
-- reason, so plan changes (rush orders, last-minute additions, speed-ups,
-- delays) can be reported on and audited later. Tasks are cancelled, never
-- deleted. All access goes through the service role: the portal pages check
-- the module permission, the tables are closed to anon/authenticated.

-- ------------------------------------------------------------------ catalogues

create table ps_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name_fr text not null check (length(trim(name_fr)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  colour text not null default '#6b7280' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  -- false: two tasks overlapping in this room are flagged as a conflict.
  allows_concurrent boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ps_production_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name_fr text not null check (length(trim(name_fr)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Same rooms and processes as the Atelier, so the two can be joined by code later.
insert into ps_rooms (code, name_fr, name_en, colour, allows_concurrent, sort_order) values
  ('A', 'Kief et emballage', 'Kief & packaging', '#0f7b6c', false, 10),
  ('B', 'IWE et formulation', 'IWE & formulation', '#6d4bd8', false, 20),
  ('C', 'Séchage et rosin', 'Drying & rosin', '#1f66d0', true, 30);

insert into ps_production_types (code, name_fr, name_en, sort_order) values
  ('KIEF_EXTRACTION', 'Extraction de kief', 'Kief extraction', 10),
  ('IWE_EXTRACTION', 'Extraction à l’eau glacée (IWE)', 'Ice water extraction (IWE)', 20),
  ('TRICHOME_DRYING', 'Séchage des trichomes', 'Trichome drying', 30),
  ('HASH_FORMULATION', 'Formulation de hash (kief)', 'Hash formulation (kief)', 40),
  ('IWE_HASH_FORM', 'Formulation de hash IWE', 'IWE hash formulation', 50),
  ('ROSIN_PRESSING', 'Pressage de rosin', 'Rosin pressing', 60),
  ('PACKAGING', 'Emballage', 'Packaging', 70);

-- ----------------------------------------------------------------------- tasks

create type ps_status as enum ('planned', 'in_progress', 'on_hold', 'done', 'cancelled');

create table ps_counters (
  year int primary key,
  last int not null
);

create table ps_tasks (
  id uuid primary key default gen_random_uuid(),
  task_no text not null unique,
  production_type_id uuid not null references ps_production_types(id),
  room_id uuid not null references ps_rooms(id),
  status ps_status not null default 'planned',
  priority text not null default 'normal' check (priority in ('normal', 'rush')),
  start_date date not null,
  end_date date not null,
  -- The dates as first planned. Never updated: the gap to the current dates
  -- is how far the plan has moved.
  original_start_date date not null,
  original_end_date date not null,
  actual_start_date date,
  actual_end_date date,
  groweriq_lot_id text,
  groweriq_batch_id text,
  notes text,
  version int not null default 1,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  constraint ps_tasks_dates check (end_date >= start_date),
  constraint ps_tasks_actual_dates check (
    actual_start_date is null or actual_end_date is null or actual_end_date >= actual_start_date)
);
create index ps_tasks_window on ps_tasks (start_date, end_date);
create index ps_tasks_room on ps_tasks (room_id);

create table ps_task_inputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references ps_tasks(id) on delete cascade,
  sort_order int not null default 0,
  material text not null check (length(trim(material)) > 0),
  groweriq_lot_id text,
  quantity numeric(14,3) check (quantity is null or quantity > 0),
  unit text not null default 'g' check (unit in ('g', 'kg', 'unit'))
);
create index ps_task_inputs_task on ps_task_inputs (task_id);

-- ------------------------------------------------------------------ change log

create table ps_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references ps_tasks(id),
  at timestamptz not null default now(),
  staff_id uuid references staff(id),
  kind text not null check (kind in ('created', 'rescheduled', 'status', 'updated')),
  reason_code text check (reason_code in (
    'planned', 'added_last_minute', 'rush_order', 'accelerated', 'slowed',
    'material_delay', 'equipment', 'staffing', 'qa_hold', 'customer_change',
    'estimate_correction', 'other')),
  reason_note text,
  -- { field: { from, to } } for updates; the initial values for 'created'.
  changes jsonb not null default '{}'::jsonb,
  -- Days the start / projected end moved (positive = later). Null if unchanged.
  start_shift_days int,
  end_shift_days int,
  room_changed boolean not null default false
);
create index ps_task_events_task on ps_task_events (task_id, at);
create index ps_task_events_at on ps_task_events (at);

create or replace function ps_refuse()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '%', tg_argv[0];
end;
$$;

create trigger ps_task_events_append_only
  before update or delete on ps_task_events
  for each row execute function ps_refuse('ps_task_events is append-only.');
create trigger ps_tasks_never_deleted
  before delete on ps_tasks
  for each row execute function ps_refuse('Production tasks are cancelled, never deleted.');

-- ---------------------------------------------------------------- save a task
--
-- p_id null creates a task; otherwise only the keys present in p_data change.
-- p_inputs null leaves the inputs alone; an array replaces them.
-- p_expected_version guards against two people saving over each other.
-- Errors raised with a stable code the API maps to a message:
--   NOT_FOUND, VERSION_CONFLICT, REASON_REQUIRED, BAD_REASON, DATES_ORDER,
--   ACTUAL_DATES_ORDER, MISSING_FIELDS.

create or replace function ps_save_task(
  p_id uuid,
  p_expected_version int,
  p_data jsonb,
  p_inputs jsonb,
  p_staff uuid,
  p_reason text,
  p_note text
)
returns table (out_id uuid, out_task_no text, out_version int)
language plpgsql
set search_path = public
as $$
declare
  o ps_tasks;
  n ps_tasks;
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_changes jsonb := '{}'::jsonb;
  v_old_inputs jsonb;
  v_new_inputs jsonb;
  v_sched boolean;
  v_kind text;
  v_year int;
  v_seq int;
  k text;
begin
  if v_reason is not null and v_reason not in (
    'planned', 'added_last_minute', 'rush_order', 'accelerated', 'slowed',
    'material_delay', 'equipment', 'staffing', 'qa_hold', 'customer_change',
    'estimate_correction', 'other') then
    raise exception 'BAD_REASON';
  end if;

  -- Normalised inputs: blank rows dropped, text trimmed, same shape as stored.
  if p_inputs is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'material', trim(e->>'material'),
             'groweriq_lot_id', nullif(trim(coalesce(e->>'groweriq_lot_id', '')), ''),
             'quantity', nullif(trim(coalesce(e->>'quantity', '')), '')::numeric(14,3),
             'unit', coalesce(nullif(e->>'unit', ''), 'g')) order by i), '[]'::jsonb)
      into v_new_inputs
      from jsonb_array_elements(p_inputs) with ordinality as x(e, i)
     where nullif(trim(coalesce(e->>'material', '')), '') is not null;
  end if;

  -- ------------------------------------------------------------- create
  if p_id is null then
    if coalesce(p_data->>'production_type_id', '') = '' or coalesce(p_data->>'room_id', '') = ''
       or coalesce(p_data->>'start_date', '') = '' or coalesce(p_data->>'end_date', '') = '' then
      raise exception 'MISSING_FIELDS';
    end if;
    if (p_data->>'end_date')::date < (p_data->>'start_date')::date then
      raise exception 'DATES_ORDER';
    end if;
    if v_reason is not null and v_reason not in ('planned', 'added_last_minute', 'rush_order') then
      raise exception 'BAD_REASON';
    end if;

    v_year := extract(year from v_today);
    insert into ps_counters as c (year, last) values (v_year, 1)
      on conflict (year) do update set last = c.last + 1
      returning c.last into v_seq;

    insert into ps_tasks (
      task_no, production_type_id, room_id, status, priority,
      start_date, end_date, original_start_date, original_end_date,
      groweriq_lot_id, groweriq_batch_id, notes, created_by, updated_by)
    values (
      'PRD-' || to_char(v_year % 100, 'FM00') || '-' || lpad(v_seq::text, 4, '0'),
      (p_data->>'production_type_id')::uuid, (p_data->>'room_id')::uuid,
      'planned', coalesce(nullif(p_data->>'priority', ''), 'normal'),
      (p_data->>'start_date')::date, (p_data->>'end_date')::date,
      (p_data->>'start_date')::date, (p_data->>'end_date')::date,
      nullif(trim(coalesce(p_data->>'groweriq_lot_id', '')), ''),
      nullif(trim(coalesce(p_data->>'groweriq_batch_id', '')), ''),
      nullif(trim(coalesce(p_data->>'notes', '')), ''),
      p_staff, p_staff)
    returning * into n;

    insert into ps_task_inputs (task_id, sort_order, material, groweriq_lot_id, quantity, unit)
    select n.id, i, e->>'material', e->>'groweriq_lot_id', (e->>'quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(coalesce(v_new_inputs, '[]'::jsonb)) with ordinality as x(e, i);

    insert into ps_task_events (task_id, staff_id, kind, reason_code, reason_note, changes)
    values (n.id, p_staff, 'created', coalesce(v_reason, 'planned'), v_note,
      jsonb_build_object(
        'production_type_id', n.production_type_id, 'room_id', n.room_id,
        'priority', n.priority, 'start_date', n.start_date, 'end_date', n.end_date,
        'groweriq_lot_id', n.groweriq_lot_id, 'groweriq_batch_id', n.groweriq_batch_id,
        'notes', n.notes, 'inputs', coalesce(v_new_inputs, '[]'::jsonb)));

    return query select n.id, n.task_no, n.version;
    return;
  end if;

  -- ------------------------------------------------------------- update
  select * into o from ps_tasks t where t.id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is not null and o.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if v_reason = 'planned' then raise exception 'BAD_REASON'; end if;

  n := o;
  if p_data ? 'production_type_id' then n.production_type_id := (p_data->>'production_type_id')::uuid; end if;
  if p_data ? 'room_id' then n.room_id := (p_data->>'room_id')::uuid; end if;
  if p_data ? 'status' then n.status := (p_data->>'status')::ps_status; end if;
  if p_data ? 'priority' then n.priority := coalesce(nullif(p_data->>'priority', ''), 'normal'); end if;
  if p_data ? 'start_date' then n.start_date := (p_data->>'start_date')::date; end if;
  if p_data ? 'end_date' then n.end_date := (p_data->>'end_date')::date; end if;
  if p_data ? 'actual_start_date' then n.actual_start_date := nullif(p_data->>'actual_start_date', '')::date; end if;
  if p_data ? 'actual_end_date' then n.actual_end_date := nullif(p_data->>'actual_end_date', '')::date; end if;
  if p_data ? 'groweriq_lot_id' then n.groweriq_lot_id := nullif(trim(coalesce(p_data->>'groweriq_lot_id', '')), ''); end if;
  if p_data ? 'groweriq_batch_id' then n.groweriq_batch_id := nullif(trim(coalesce(p_data->>'groweriq_batch_id', '')), ''); end if;
  if p_data ? 'notes' then n.notes := nullif(trim(coalesce(p_data->>'notes', '')), ''); end if;

  -- Status moves fill in the real dates nobody should have to type.
  if n.status in ('in_progress', 'on_hold', 'done') and n.actual_start_date is null then
    n.actual_start_date := least(n.start_date, v_today);
  end if;
  if n.status = 'done' and n.actual_end_date is null then
    n.actual_end_date := greatest(v_today, n.actual_start_date);
  end if;
  if n.status in ('planned', 'in_progress', 'on_hold') and o.status = 'done' and not (p_data ? 'actual_end_date') then
    n.actual_end_date := null;
  end if;
  if n.status = 'planned' and o.status <> 'planned' and not (p_data ? 'actual_start_date') then
    n.actual_start_date := null;
  end if;

  if n.end_date < n.start_date then raise exception 'DATES_ORDER'; end if;
  if n.actual_start_date is not null and n.actual_end_date is not null
     and n.actual_end_date < n.actual_start_date then
    raise exception 'ACTUAL_DATES_ORDER';
  end if;

  foreach k in array array['production_type_id', 'room_id', 'status', 'priority', 'start_date',
    'end_date', 'actual_start_date', 'actual_end_date', 'groweriq_lot_id', 'groweriq_batch_id', 'notes']
  loop
    if to_jsonb(o)->k is distinct from to_jsonb(n)->k then
      v_changes := v_changes || jsonb_build_object(k,
        jsonb_build_object('from', to_jsonb(o)->k, 'to', to_jsonb(n)->k));
    end if;
  end loop;

  if v_new_inputs is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'material', material, 'groweriq_lot_id', groweriq_lot_id,
             'quantity', quantity, 'unit', unit) order by sort_order), '[]'::jsonb)
      into v_old_inputs
      from ps_task_inputs where ps_task_inputs.task_id = p_id;
    if v_old_inputs is distinct from v_new_inputs then
      v_changes := v_changes || jsonb_build_object('inputs',
        jsonb_build_object('from', v_old_inputs, 'to', v_new_inputs));
    end if;
  end if;

  -- Nothing changed: no event, no version bump.
  if v_changes = '{}'::jsonb then
    return query select o.id, o.task_no, o.version;
    return;
  end if;

  v_sched := v_changes ?| array['start_date', 'end_date', 'room_id'];
  if v_reason is null and (v_sched or (v_changes ? 'status' and n.status in ('on_hold', 'cancelled'))) then
    raise exception 'REASON_REQUIRED';
  end if;

  if v_changes ? 'inputs' then
    delete from ps_task_inputs where ps_task_inputs.task_id = p_id;
    insert into ps_task_inputs (task_id, sort_order, material, groweriq_lot_id, quantity, unit)
    select p_id, i, e->>'material', e->>'groweriq_lot_id', (e->>'quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(v_new_inputs) with ordinality as x(e, i);
  end if;

  update ps_tasks t set
    production_type_id = n.production_type_id, room_id = n.room_id, status = n.status,
    priority = n.priority, start_date = n.start_date, end_date = n.end_date,
    actual_start_date = n.actual_start_date, actual_end_date = n.actual_end_date,
    groweriq_lot_id = n.groweriq_lot_id, groweriq_batch_id = n.groweriq_batch_id,
    notes = n.notes, version = o.version + 1, updated_by = p_staff, updated_at = now()
  where t.id = p_id;

  v_kind := case when v_sched then 'rescheduled' when v_changes ? 'status' then 'status' else 'updated' end;

  insert into ps_task_events (task_id, staff_id, kind, reason_code, reason_note, changes,
    start_shift_days, end_shift_days, room_changed)
  values (p_id, p_staff, v_kind, v_reason, v_note, v_changes,
    case when v_changes ? 'start_date' then n.start_date - o.start_date end,
    case when v_changes ? 'end_date' then n.end_date - o.end_date end,
    v_changes ? 'room_id');

  return query select o.id, o.task_no, o.version + 1;
end;
$$;

-- ------------------------------------------------------------------ lock down

alter table ps_rooms enable row level security;
alter table ps_production_types enable row level security;
alter table ps_counters enable row level security;
alter table ps_tasks enable row level security;
alter table ps_task_inputs enable row level security;
alter table ps_task_events enable row level security;

revoke all on ps_rooms, ps_production_types, ps_counters, ps_tasks, ps_task_inputs, ps_task_events
  from anon, authenticated;
revoke all on function ps_save_task(uuid, int, jsonb, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function ps_refuse() from public, anon, authenticated;
grant execute on function ps_save_task(uuid, int, jsonb, jsonb, uuid, text, text) to service_role;
