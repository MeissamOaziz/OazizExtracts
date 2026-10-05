-- Atelier phase 2 — order intake.
--
-- Decisions encoded here (Meissam, 2026-09-08):
--   * Numbering: every order gets an Atelier number (OAZ-YYYY-NNNN) AND keeps the
--     customer PO reference. The customer PO is what the UI shows first; the
--     Atelier number is the stable key that internal refills and packaging runs
--     also need.
--   * Every order gets a work order, flower resale included, so nothing is
--     invisible on the boards. It is created at intake in `awaiting_plan`.
--   * Internal refills go straight into production's queue — no acceptance step.
--   * QA hold is an OVERLAY, not a status: an order keeps its own state while
--     held, so lifting a hold resumes exactly where it was.

create type ops_order_source as enum ('customer_po', 'internal_refill', 'packaging_request');

create type ops_order_status as enum (
  'draft', 'submitted', 'in_production', 'ready_to_ship', 'shipped', 'closed', 'cancelled'
);

create type ops_wo_status as enum ('awaiting_plan', 'planned', 'in_progress', 'done', 'cancelled');

create type ops_refill_purpose as enum ('export', 'domestic', 'medical', 'recreational', 'oaziz_sku');

create type ops_hold_entity as enum ('order', 'lot', 'stage');

create type ops_uom as enum ('g', 'kg', 'units', 'ml');

create type ops_attachment_kind as enum ('po', 'coa', 'label_proof', 'other');

create type ops_priority as enum ('low', 'normal', 'high', 'critical');

-- ============================================================
-- Order numbering — OAZ-<year>-<0001>, restarting each year
-- ============================================================

create table ops_counters (
  scope      text primary key,
  last_value int not null default 0
);

-- Numbering runs as BEFORE INSERT triggers rather than column defaults.
-- ops_counters is RLS-protected and has no write policy, so the functions must be
-- SECURITY DEFINER to increment it — but as trigger functions they need no EXECUTE
-- grant to the calling role and are not reachable over /rest/v1/rpc. That keeps
-- numbering concurrency-safe without exposing anything.

create or replace function ops_set_order_no()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  y text := to_char(now() at time zone 'America/Toronto', 'YYYY');
  n int;
begin
  if new.order_no is not null and new.order_no <> '' then return new; end if;
  insert into ops_counters (scope, last_value) values ('order:' || y, 1)
  on conflict (scope) do update set last_value = ops_counters.last_value + 1
  returning last_value into n;
  new.order_no := 'OAZ-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$fn$;

create or replace function ops_set_wo_no()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if new.wo_no is not null and new.wo_no <> '' then return new; end if;
  insert into ops_counters (scope, last_value) values ('wo', 1)
  on conflict (scope) do update set last_value = ops_counters.last_value + 1
  returning last_value into n;
  new.wo_no := 'WO-' || lpad(n::text, 4, '0');
  return new;
end;
$fn$;

revoke execute on function ops_set_order_no() from public;
revoke execute on function ops_set_wo_no()    from public;

-- ============================================================
-- Orders
-- ============================================================

create table ops_orders (
  id                      uuid primary key default gen_random_uuid(),
  order_no                text not null unique,
  source                  ops_order_source not null,
  status                  ops_order_status not null default 'submitted',
  -- Maintained by trigger from ops_holds; an order keeps its status while held.
  on_hold                 boolean not null default false,

  customer_id             uuid references ops_customers(id),
  customer_po_ref         text,

  order_date              date not null default current_date,
  requested_delivery_date date,
  promised_delivery_date  date,

  ship_to_address_id      uuid references ops_customer_addresses(id),
  ship_to_text            text,
  payment_terms           text,
  currency                text not null default 'CAD',
  excise_province         text,
  priority                ops_priority not null default 'normal',

  notes                   text,
  created_by_staff_id     uuid references staff(id),
  created_by_email        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index ops_orders_status_idx   on ops_orders (status);
create index ops_orders_source_idx   on ops_orders (source);
create index ops_orders_customer_idx on ops_orders (customer_id);
create index ops_orders_created_idx  on ops_orders (created_at desc);
create index ops_orders_po_idx       on ops_orders (customer_po_ref);

create trigger ops_orders_set_no
before insert on ops_orders for each row execute function ops_set_order_no();

create trigger ops_orders_touch_updated_at
before update on ops_orders for each row execute function touch_updated_at();

create table ops_order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references ops_orders(id) on delete cascade,
  line_no          int not null,
  product_id       uuid references ops_products(id),
  -- Free text for anything not (yet) in the catalogue — intake must never be
  -- blocked by a missing SKU.
  product_name     text not null,
  material_id      uuid references ops_materials(id),
  lot_ref          text,
  qty              numeric(14,3) not null,
  uom              ops_uom not null default 'g',
  sku_size_g       numeric(10,3),
  unit_price       numeric(12,4),
  excise_province  text,
  cultivar         text,
  notes            text,
  unique (order_id, line_no)
);

create index ops_order_lines_order_idx on ops_order_lines (order_id);

-- Internal refill detail. 1:1 with its order.
create table ops_refill_specs (
  order_id             uuid primary key references ops_orders(id) on delete cascade,
  thc_min_pct          numeric(6,3),
  thc_max_pct          numeric(6,3),
  cbd_min_pct          numeric(6,3),
  cbd_max_pct          numeric(6,3),
  other_cannabinoids   jsonb not null default '{}'::jsonb,
  purpose              ops_refill_purpose,
  source_material_id   uuid references ops_materials(id),
  source_lot_ref       text,
  special_requests     text
);

create table ops_order_attachments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references ops_orders(id) on delete cascade,
  kind          ops_attachment_kind not null default 'other',
  storage_path  text not null,
  filename      text not null,
  content_type  text,
  size_bytes    int,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now()
);

create index ops_order_attachments_order_idx on ops_order_attachments (order_id);

-- ============================================================
-- Work orders — created at intake, planned in phase 3
-- ============================================================

create table ops_work_orders (
  id                   uuid primary key default gen_random_uuid(),
  wo_no                text not null unique,
  order_id             uuid not null references ops_orders(id) on delete cascade,
  status               ops_wo_status not null default 'awaiting_plan',
  assignee_staff_id    uuid references staff(id),
  promised_date        date,
  projected_completion date,
  at_risk              boolean not null default false,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index ops_work_orders_order_idx  on ops_work_orders (order_id);
create index ops_work_orders_status_idx on ops_work_orders (status);

create trigger ops_work_orders_set_no
before insert on ops_work_orders for each row execute function ops_set_wo_no();

create trigger ops_work_orders_touch_updated_at
before update on ops_work_orders for each row execute function touch_updated_at();

-- ============================================================
-- QA holds — an overlay over any entity
-- ============================================================

create table ops_holds (
  id                 uuid primary key default gen_random_uuid(),
  entity_type        ops_hold_entity not null,
  entity_id          uuid not null,
  reason             text not null,
  held_by_staff_id   uuid references staff(id),
  held_at            timestamptz not null default now(),
  lifted_by_staff_id uuid references staff(id),
  lifted_at          timestamptz,
  lift_note          text,
  -- For lot holds: the state to put the lot back into when the hold is lifted.
  prev_lot_state     ops_lot_state
);

create index ops_holds_entity_idx on ops_holds (entity_type, entity_id);
-- At most one active hold per entity.
create unique index ops_holds_one_active
  on ops_holds (entity_type, entity_id) where lifted_at is null;

comment on table ops_holds is
  'QA hold is an overlay, not a status: the held entity keeps its own state so lifting resumes where it was. Full history retained — every hold and lift stays queryable.';

-- Keep ops_orders.on_hold in step, so list views need no join.
create or replace function ops_holds_sync_order()
returns trigger language plpgsql set search_path = public as $fn$
declare target uuid;
begin
  target := coalesce(new.entity_id, old.entity_id);
  if coalesce(new.entity_type, old.entity_type) = 'order' then
    update ops_orders o
      set on_hold = exists (
        select 1 from ops_holds h
        where h.entity_type = 'order' and h.entity_id = target and h.lifted_at is null
      )
    where o.id = target;
  end if;
  return null;
end;
$fn$;

create trigger ops_holds_sync_order_aiud
after insert or update or delete on ops_holds
for each row execute function ops_holds_sync_order();

-- Lots carry their hold in their own state column, so the previous state is
-- captured on hold and restored on lift — a lifted hold must not strand a lot
-- in 'on_hold' forever.
create or replace function ops_holds_capture_lot_state()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.entity_type = 'lot' and new.prev_lot_state is null then
    select state into new.prev_lot_state from ops_lots where id = new.entity_id;
  end if;
  return new;
end;
$fn$;

create trigger ops_holds_capture_lot_state_bi
before insert on ops_holds
for each row execute function ops_holds_capture_lot_state();

create or replace function ops_holds_sync_lot()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.entity_type <> 'lot' then return null; end if;
  if new.lifted_at is null then
    update ops_lots set state = 'on_hold' where id = new.entity_id;
  elsif old.lifted_at is null and new.prev_lot_state is not null then
    update ops_lots set state = new.prev_lot_state where id = new.entity_id;
  end if;
  return null;
end;
$fn$;

create trigger ops_holds_sync_lot_ai
after insert on ops_holds
for each row execute function ops_holds_sync_lot();

create trigger ops_holds_sync_lot_au
after update on ops_holds
for each row execute function ops_holds_sync_lot();

-- ============================================================
-- Activity feed
-- ============================================================

create table ops_events (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid references ops_orders(id) on delete cascade,
  work_order_id  uuid references ops_work_orders(id) on delete cascade,
  actor_staff_id uuid references staff(id),
  actor_email    text,
  action         text not null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index ops_events_order_idx on ops_events (order_id, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table ops_counters          enable row level security;
alter table ops_orders            enable row level security;
alter table ops_order_lines       enable row level security;
alter table ops_refill_specs      enable row level security;
alter table ops_order_attachments enable row level security;
alter table ops_work_orders       enable row level security;
alter table ops_holds             enable row level security;
alter table ops_events            enable row level security;

-- Shared visibility: anyone signed in reads everything.
do $do$
declare t text;
begin
  foreach t in array array[
    'ops_orders','ops_order_lines','ops_refill_specs','ops_order_attachments',
    'ops_work_orders','ops_holds','ops_events'
  ] loop
    execute format('create policy %I on %I for select to authenticated using (true)',
                   t || '_read_authenticated', t);
  end loop;
end $do$;

-- Anyone with an Atelier role may create and edit orders: whoever receives the
-- PO varies, and intake should never be the bottleneck.
do $do$
declare t text;
begin
  foreach t in array array[
    'ops_orders','ops_order_lines','ops_refill_specs','ops_order_attachments',
    'ops_work_orders','ops_events'
  ] loop
    execute format('create policy %I on %I for all to authenticated
                      using (ops_current_role() is not null)
                      with check (ops_current_role() is not null)',
                   t || '_write', t);
  end loop;
end $do$;

-- Holds are QA's alone (admin included so the system stays operable).
create policy ops_holds_write on ops_holds
  for all to authenticated
  using (ops_current_role() in ('qa', 'admin'))
  with check (ops_current_role() in ('qa', 'admin'));

-- ops_counters is written only through the numbering functions.
create policy ops_counters_read on ops_counters
  for select to authenticated using (true);
