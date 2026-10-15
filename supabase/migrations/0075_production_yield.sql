-- Production scheduling: expected and actual output, and yield.
--
-- A task now says what it is expected to produce (one or more products, some
-- of them by-products), each with an expected yield %, and once the work is
-- done, how much of each input was really used and how much of each output
-- came out — so the portal can show the actual yield against the expected one.
--
-- Each production type carries default outputs with a default yield that the
-- production lead can edit in Settings; a new task is prefilled from them and
-- every value stays editable on the task. Starting values: trim to kief 20 %,
-- trim to IWE trichomes 10 %, IWE trichomes to rosin 60 %.
--
-- Outputs and actual quantities are saved through ps_save_task like the rest
-- of a task, so every change is in the task's change log.

alter table ps_task_inputs
  add column actual_quantity numeric(14,3) check (actual_quantity is null or actual_quantity >= 0);

create table ps_task_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references ps_tasks(id) on delete cascade,
  sort_order int not null default 0,
  product text not null check (length(trim(product)) > 0),
  is_byproduct boolean not null default false,
  expected_yield_pct numeric(6,2) check (expected_yield_pct is null or (expected_yield_pct >= 0 and expected_yield_pct <= 100)),
  actual_quantity numeric(14,3) check (actual_quantity is null or actual_quantity >= 0),
  unit text not null default 'g' check (unit in ('g', 'kg', 'unit'))
);
create index ps_task_outputs_task on ps_task_outputs (task_id);

create table ps_type_outputs (
  id uuid primary key default gen_random_uuid(),
  production_type_id uuid not null references ps_production_types(id) on delete cascade,
  sort_order int not null default 0,
  product text not null check (length(trim(product)) > 0),
  is_byproduct boolean not null default false,
  default_yield_pct numeric(6,2) check (default_yield_pct is null or (default_yield_pct >= 0 and default_yield_pct <= 100))
);
create index ps_type_outputs_type on ps_type_outputs (production_type_id);

insert into ps_type_outputs (production_type_id, sort_order, product, default_yield_pct)
select id, 1, v.product, v.pct
  from ps_production_types t
  join (values ('KIEF_EXTRACTION', 'Kief', 20.00),
               ('IWE_EXTRACTION', 'Trichomes IWE', 10.00),
               ('ROSIN_PRESSING', 'Rosin', 60.00)) as v(code, product, pct) on v.code = t.code;

-- ps_save_task gains p_outputs (last, defaulted). A new signature cannot be
-- created over the old one, so the 7-argument version is dropped first.
drop function ps_save_task(uuid, int, jsonb, jsonb, uuid, text, text);

create function ps_save_task(
  p_id uuid,
  p_expected_version int,
  p_data jsonb,
  p_inputs jsonb,
  p_staff uuid,
  p_reason text,
  p_note text,
  p_outputs jsonb default null
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
  v_old_outputs jsonb;
  v_new_outputs jsonb;
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
             'actual_quantity', nullif(trim(coalesce(e->>'actual_quantity', '')), '')::numeric(14,3),
             'unit', coalesce(nullif(e->>'unit', ''), 'g')) order by i), '[]'::jsonb)
      into v_new_inputs
      from jsonb_array_elements(p_inputs) with ordinality as x(e, i)
     where nullif(trim(coalesce(e->>'material', '')), '') is not null;
  end if;

  -- Normalised outputs, same idea: what the task is expected to produce.
  if p_outputs is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'product', trim(e->>'product'),
             'is_byproduct', coalesce((e->>'is_byproduct')::boolean, false),
             'expected_yield_pct', nullif(trim(coalesce(e->>'expected_yield_pct', '')), '')::numeric(6,2),
             'actual_quantity', nullif(trim(coalesce(e->>'actual_quantity', '')), '')::numeric(14,3),
             'unit', coalesce(nullif(e->>'unit', ''), 'g')) order by i), '[]'::jsonb)
      into v_new_outputs
      from jsonb_array_elements(p_outputs) with ordinality as x(e, i)
     where nullif(trim(coalesce(e->>'product', '')), '') is not null;
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
      groweriq_lot_id, groweriq_batch_id, notes, request_id, created_by, updated_by)
    values (
      'PRD-' || to_char(v_year % 100, 'FM00') || '-' || lpad(v_seq::text, 4, '0'),
      (p_data->>'production_type_id')::uuid, (p_data->>'room_id')::uuid,
      'planned', coalesce(nullif(p_data->>'priority', ''), 'normal'),
      (p_data->>'start_date')::date, (p_data->>'end_date')::date,
      (p_data->>'start_date')::date, (p_data->>'end_date')::date,
      nullif(trim(coalesce(p_data->>'groweriq_lot_id', '')), ''),
      nullif(trim(coalesce(p_data->>'groweriq_batch_id', '')), ''),
      nullif(trim(coalesce(p_data->>'notes', '')), ''),
      nullif(p_data->>'request_id', '')::uuid,
      p_staff, p_staff)
    returning * into n;

    insert into ps_task_inputs (task_id, sort_order, material, groweriq_lot_id, quantity, actual_quantity, unit)
    select n.id, i, e->>'material', e->>'groweriq_lot_id', (e->>'quantity')::numeric(14,3),
           (e->>'actual_quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(coalesce(v_new_inputs, '[]'::jsonb)) with ordinality as x(e, i);

    insert into ps_task_outputs (task_id, sort_order, product, is_byproduct, expected_yield_pct, actual_quantity, unit)
    select n.id, i, e->>'product', (e->>'is_byproduct')::boolean, (e->>'expected_yield_pct')::numeric(6,2),
           (e->>'actual_quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(coalesce(v_new_outputs, '[]'::jsonb)) with ordinality as x(e, i);

    insert into ps_task_events (task_id, staff_id, kind, reason_code, reason_note, changes)
    values (n.id, p_staff, 'created', coalesce(v_reason, 'planned'), v_note,
      jsonb_build_object(
        'production_type_id', n.production_type_id, 'room_id', n.room_id,
        'priority', n.priority, 'start_date', n.start_date, 'end_date', n.end_date,
        'groweriq_lot_id', n.groweriq_lot_id, 'groweriq_batch_id', n.groweriq_batch_id,
        'notes', n.notes, 'request_id', n.request_id, 'inputs', coalesce(v_new_inputs, '[]'::jsonb),
        'outputs', coalesce(v_new_outputs, '[]'::jsonb)));

    if n.request_id is not null then
      insert into ps_request_events (request_id, staff_id, kind, changes)
      values (n.request_id, p_staff, 'task_linked', jsonb_build_object('task_id', n.id, 'task_no', n.task_no));
    end if;

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
  if p_data ? 'request_id' then n.request_id := nullif(p_data->>'request_id', '')::uuid; end if;

  -- Status moves fill in the real dates nobody should have to type.
  -- Putting a task on hold does not start it: only starting or finishing it does.
  if n.status in ('in_progress', 'done') and n.actual_start_date is null then
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
    'end_date', 'actual_start_date', 'actual_end_date', 'groweriq_lot_id', 'groweriq_batch_id', 'notes', 'request_id']
  loop
    if to_jsonb(o)->k is distinct from to_jsonb(n)->k then
      v_changes := v_changes || jsonb_build_object(k,
        jsonb_build_object('from', to_jsonb(o)->k, 'to', to_jsonb(n)->k));
    end if;
  end loop;

  if v_new_inputs is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'material', material, 'groweriq_lot_id', groweriq_lot_id,
             'quantity', quantity, 'actual_quantity', actual_quantity, 'unit', unit) order by sort_order), '[]'::jsonb)
      into v_old_inputs
      from ps_task_inputs where ps_task_inputs.task_id = p_id;
    if v_old_inputs is distinct from v_new_inputs then
      v_changes := v_changes || jsonb_build_object('inputs',
        jsonb_build_object('from', v_old_inputs, 'to', v_new_inputs));
    end if;
  end if;

  if v_new_outputs is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'product', product, 'is_byproduct', is_byproduct, 'expected_yield_pct', expected_yield_pct,
             'actual_quantity', actual_quantity, 'unit', unit) order by sort_order), '[]'::jsonb)
      into v_old_outputs
      from ps_task_outputs where ps_task_outputs.task_id = p_id;
    if v_old_outputs is distinct from v_new_outputs then
      v_changes := v_changes || jsonb_build_object('outputs',
        jsonb_build_object('from', v_old_outputs, 'to', v_new_outputs));
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
    insert into ps_task_inputs (task_id, sort_order, material, groweriq_lot_id, quantity, actual_quantity, unit)
    select p_id, i, e->>'material', e->>'groweriq_lot_id', (e->>'quantity')::numeric(14,3),
           (e->>'actual_quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(v_new_inputs) with ordinality as x(e, i);
  end if;

  if v_changes ? 'outputs' then
    delete from ps_task_outputs where ps_task_outputs.task_id = p_id;
    insert into ps_task_outputs (task_id, sort_order, product, is_byproduct, expected_yield_pct, actual_quantity, unit)
    select p_id, i, e->>'product', (e->>'is_byproduct')::boolean, (e->>'expected_yield_pct')::numeric(6,2),
           (e->>'actual_quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(v_new_outputs) with ordinality as x(e, i);
  end if;

  update ps_tasks t set
    production_type_id = n.production_type_id, room_id = n.room_id, status = n.status,
    priority = n.priority, start_date = n.start_date, end_date = n.end_date,
    actual_start_date = n.actual_start_date, actual_end_date = n.actual_end_date,
    groweriq_lot_id = n.groweriq_lot_id, groweriq_batch_id = n.groweriq_batch_id,
    notes = n.notes, request_id = n.request_id, version = o.version + 1, updated_by = p_staff, updated_at = now()
  where t.id = p_id;

  if v_changes ? 'request_id' and n.request_id is not null then
    insert into ps_request_events (request_id, staff_id, kind, changes)
    values (n.request_id, p_staff, 'task_linked', jsonb_build_object('task_id', o.id, 'task_no', o.task_no));
  end if;

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

alter table ps_task_outputs enable row level security;
alter table ps_type_outputs enable row level security;
revoke all on ps_task_outputs, ps_type_outputs from anon, authenticated;
revoke all on function ps_save_task(uuid, int, jsonb, jsonb, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function ps_save_task(uuid, int, jsonb, jsonb, uuid, text, text, jsonb) to service_role;
