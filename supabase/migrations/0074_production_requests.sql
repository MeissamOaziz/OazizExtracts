-- Production scheduling: requests. Anyone with the "requests" access (sales,
-- QA, management) can ask the production lead for work: a customer PO, an
-- internal restock or a packaging run, with its lines and its files (the PO
-- PDF, a spreadsheet, a forwarded email). The production lead turns a request
-- into one or more tasks; a task now remembers the request it serves.
--
-- Requests are never deleted (cancelled instead), files are never erased from
-- the record (marked removed), and every change is one row in an append-only
-- log, same as tasks. Access goes through the service role only.

-- --------------------------------------------------------------------- requests

create type ps_request_kind as enum ('customer_po', 'internal', 'packaging');

create table ps_request_counters (
  year int primary key,
  last int not null
);

create table ps_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  kind ps_request_kind not null,
  title text not null check (length(trim(title)) > 0),
  customer_name text,
  customer_po text,
  needed_by date,
  priority text not null default 'normal' check (priority in ('normal', 'rush')),
  production_type_id uuid references ps_production_types(id),
  notes text,
  requested_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references staff(id),
  cancel_reason text,
  constraint ps_requests_cancel_reason check (cancelled_at is null or length(trim(coalesce(cancel_reason, ''))) > 0)
);
create index ps_requests_created on ps_requests (created_at desc);

create table ps_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references ps_requests(id) on delete cascade,
  sort_order int not null default 0,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(14,3) check (quantity is null or quantity > 0),
  unit text not null default 'unit' check (unit in ('g', 'kg', 'unit'))
);
create index ps_request_lines_request on ps_request_lines (request_id);

create table ps_request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references ps_requests(id),
  storage_path text not null unique,
  filename text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references staff(id),
  uploaded_at timestamptz not null default now(),
  -- Removing a file hides it; the record of what was attached stays.
  removed_at timestamptz,
  removed_by uuid references staff(id)
);
create index ps_request_files_request on ps_request_files (request_id);

create table ps_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references ps_requests(id),
  at timestamptz not null default now(),
  staff_id uuid references staff(id),
  kind text not null check (kind in (
    'created', 'updated', 'file_added', 'file_removed', 'cancelled', 'reopened', 'task_linked')),
  note text,
  changes jsonb not null default '{}'::jsonb
);
create index ps_request_events_request on ps_request_events (request_id, at);

create trigger ps_request_events_append_only
  before update or delete on ps_request_events
  for each row execute function ps_refuse('ps_request_events is append-only.');
create trigger ps_requests_never_deleted
  before delete on ps_requests
  for each row execute function ps_refuse('Production requests are cancelled, never deleted.');
create trigger ps_request_files_never_deleted
  before delete on ps_request_files
  for each row execute function ps_refuse('Request files are marked removed, never deleted.');

-- A task can serve one request; a request can need several tasks.
alter table ps_tasks add column request_id uuid references ps_requests(id);
create index ps_tasks_request on ps_tasks (request_id);

-- Private bucket for request files. Uploads and downloads go through server
-- routes on the service role (signed URLs), so no storage policy is granted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'production',
  'production',
  false,
  26214400,  -- 25 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel', 'text/csv', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'message/rfc822', 'application/vnd.ms-outlook', 'text/plain']
)
on conflict (id) do nothing;

-- ---------------------------------------------------- ps_save_task: request_id
-- Same function as 0073, plus request_id (set on create or edit, logged on
-- both the task and the request).

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

    insert into ps_task_inputs (task_id, sort_order, material, groweriq_lot_id, quantity, unit)
    select n.id, i, e->>'material', e->>'groweriq_lot_id', (e->>'quantity')::numeric(14,3), e->>'unit'
      from jsonb_array_elements(coalesce(v_new_inputs, '[]'::jsonb)) with ordinality as x(e, i);

    insert into ps_task_events (task_id, staff_id, kind, reason_code, reason_note, changes)
    values (n.id, p_staff, 'created', coalesce(v_reason, 'planned'), v_note,
      jsonb_build_object(
        'production_type_id', n.production_type_id, 'room_id', n.room_id,
        'priority', n.priority, 'start_date', n.start_date, 'end_date', n.end_date,
        'groweriq_lot_id', n.groweriq_lot_id, 'groweriq_batch_id', n.groweriq_batch_id,
        'notes', n.notes, 'request_id', n.request_id, 'inputs', coalesce(v_new_inputs, '[]'::jsonb)));

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

-- ------------------------------------------------------------------ lock down

alter table ps_request_counters enable row level security;
alter table ps_requests enable row level security;
alter table ps_request_lines enable row level security;
alter table ps_request_files enable row level security;
alter table ps_request_events enable row level security;

revoke all on ps_request_counters, ps_requests, ps_request_lines, ps_request_files, ps_request_events
  from anon, authenticated;
