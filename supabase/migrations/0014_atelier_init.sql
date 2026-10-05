-- Atelier — production & order-flow module. Phase 1: foundation + reference data.
-- Project: jveikcsyomkornamuude (same project as the R&D portal).
--
-- Design notes
-- ------------
-- * All tables are prefixed `ops_` and live in `public`, so the existing Supabase
--   client, auth and RLS conventions apply unchanged and no Data API schema
--   configuration is needed.
-- * Staff identity continues to work the way the portal already does: match on the
--   JWT email against `staff`. This migration only adds `staff.ops_role`.
--
-- Two decisions from Meissam that the schema has to encode structurally:
--
--   1. STABLE LOT IDENTITY. GrowerIQ changes a lot's number when material moves
--      from "received / new batch" to a normal lot, which breaks the trace. Here,
--      `ops_lots.lot_code` is assigned once by Oaziz and is IMMUTABLE (enforced by
--      trigger). State changes; the code never does. Numbers from other systems —
--      GrowerIQ, a supplier, a customer — are recorded in `ops_lot_aliases`, so a
--      renumbering upstream is absorbed as an alias instead of breaking lineage.
--
--   2. FORMULATIONS ARE MANY-TO-ONE. Oaziz is primarily an extraction company and
--      routinely merges batches of different products, plus additives such as
--      distillate and isolate. So a stage has N inputs (`ops_stage_inputs`), N
--      outputs (`ops_stage_outputs`) and explicit losses (`ops_stage_losses`) —
--      never a single input_lot column. Mass balance is checkable per stage, and
--      output potency is a mass-weighted blend of the inputs until a COA lands.
--
-- Waste and loss are recorded at stage completion (Meissam, 2026-09-02): the
-- difference between a yield number and a real mass balance.

-- ============================================================
-- Enums
-- ============================================================

create type ops_role as enum (
  'ceo', 'sales', 'production_manager', 'production', 'qa', 'shipping', 'admin'
);

create type ops_material_category as enum (
  'cannabis_raw',          -- trim, fresh flower
  'cannabis_intermediate', -- kief, trichomes
  'cannabis_finished',     -- hash, rosin, packaged flower
  'additive',              -- distillate, isolate, terpenes
  'packaging',             -- jars, cartridges, cases
  'other'
);

create type ops_process_kind as enum (
  'extraction', 'drying', 'formulation', 'pressing', 'packaging', 'other'
);

create type ops_lot_state as enum (
  'received', 'in_process', 'bulk', 'packaged', 'released', 'on_hold', 'destroyed'
);

create type ops_lot_origin as enum ('purchased', 'produced', 'returned');

create type ops_alias_system as enum ('groweriq', 'supplier', 'customer', 'legacy', 'other');

create type ops_potency_source as enum ('coa', 'calculated', 'estimate', 'supplier');

create type ops_customer_type as enum (
  'provincial_distributor', 'medical_platform', 'domestic_b2b', 'export', 'internal'
);

create type ops_movement_direction as enum (
  'received', 'consumed', 'produced', 'loss', 'adjustment', 'destroyed', 'shipped'
);

create type ops_loss_reason as enum (
  'moisture', 'process_waste', 'sampling', 'spillage', 'qa_hold', 'destruction', 'other'
);

-- ============================================================
-- staff.ops_role
-- ============================================================

alter table staff add column if not exists ops_role ops_role;

update staff set ops_role = 'ceo'                where email = 'jorge@oaziz.ca'     and ops_role is null;
update staff set ops_role = 'sales'              where email = 'kyle@oaziz.ca'      and ops_role is null;
update staff set ops_role = 'production_manager' where email = 'simon@oaziz.ca'     and ops_role is null;
update staff set ops_role = 'admin'              where email = 'meissam@oaziz.ca'   and ops_role is null;
update staff set ops_role = 'qa'                 where email = 'stephane@oaziz.ca'  and ops_role is null;
update staff set ops_role = 'qa'                 where email = 'jacobp@oaziz.ca'    and ops_role is null;
update staff set ops_role = 'production'         where email = 'theogen53@gmail.com' and ops_role is null;

-- Resolve the caller's ops_role from the JWT email. SECURITY DEFINER so RLS
-- policies can call it without needing their own read access to staff.
create or replace function ops_current_role()
returns ops_role
language sql
stable
security definer
set search_path = public
as $$
  select s.ops_role
  from staff s
  where s.email = (auth.jwt() ->> 'email')
    and s.is_active
  limit 1;
$$;

-- May the caller edit reference/settings data?
create or replace function ops_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select ops_current_role() in ('admin', 'production_manager');
$$;

-- ============================================================
-- Rooms
-- ============================================================

create table ops_rooms (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name_fr           text not null,
  name_en           text not null,
  colour            text not null,               -- hex, drives Gantt / Kanban colour coding
  -- When false, two stages overlapping in this room raise an advisory badge.
  -- Never blocks a schedule — production keeps the judgement call.
  allows_concurrent boolean not null default false,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on column ops_rooms.allows_concurrent is
  'Room C (drying + rosin pressing) runs concurrent stages by design; A and B do not.';

insert into ops_rooms (code, name_fr, name_en, colour, allows_concurrent, sort_order) values
  ('A', 'Kief et emballage',   'Kief & packaging',  '#0f7b6c', false, 1),
  ('B', 'IWE et formulation',  'IWE & formulation', '#6d4bd8', false, 2),
  ('C', 'Séchage et rosin',    'Drying & rosin',    '#1f66d0', true,  3);

-- ============================================================
-- Materials — what a lot is made of
-- ============================================================

create table ops_materials (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_fr        text not null,
  name_en        text not null,
  category       ops_material_category not null,
  is_cannabis    boolean not null default true,
  tracks_potency boolean not null default true,
  default_uom    text not null default 'g',
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table ops_materials is
  'Distillate and isolate are first-class materials, not special cases — they are routine formulation inputs.';

insert into ops_materials (code, name_fr, name_en, category, is_cannabis, tracks_potency) values
  ('TRIM',       'Trim',                  'Trim',                  'cannabis_raw',          true,  true),
  ('FLOWER',     'Fleur',                 'Flower',                'cannabis_raw',          true,  true),
  ('KIEF',       'Kief',                  'Kief',                  'cannabis_intermediate', true,  true),
  ('TRICHOMES',  'Trichomes IWE',         'IWE trichomes',         'cannabis_intermediate', true,  true),
  ('HASH',       'Hash',                  'Hash',                  'cannabis_finished',     true,  true),
  ('IWE_HASH',   'Hash IWE',              'IWE hash',              'cannabis_finished',     true,  true),
  ('ROSIN',      'Rosin',                 'Rosin',                 'cannabis_finished',     true,  true),
  ('DISTILLATE', 'Distillat',             'Distillate',            'additive',              true,  true),
  ('ISOLATE',    'Isolat',                'Isolate',               'additive',              true,  true),
  ('TERPENES',   'Terpènes',              'Terpenes',              'additive',              false, false),
  ('PACKAGING',  'Matériel d''emballage', 'Packaging material',    'packaging',             false, false);

-- ============================================================
-- Process catalogue — editable, not hard-coded
-- ============================================================

create table ops_process_types (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name_fr               text not null,
  name_en               text not null,
  kind                  ops_process_kind not null,
  room_id               uuid references ops_rooms(id),
  input_material_id     uuid references ops_materials(id),
  output_material_id    uuid references ops_materials(id),
  default_yield_pct     numeric(5,2),
  default_duration_days numeric(4,1),
  -- Formulation stages accept several input lots of different materials.
  is_formulation        boolean not null default false,
  sort_order            int not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

insert into ops_process_types
  (code, name_fr, name_en, kind, room_id, input_material_id, output_material_id,
   default_yield_pct, default_duration_days, is_formulation, sort_order)
select v.code, v.name_fr, v.name_en, v.kind::ops_process_kind,
       r.id, mi.id, mo.id, v.yield_pct, v.duration_days, v.is_formulation, v.sort_order
from (values
  ('KIEF_EXTRACTION',  'Extraction de kief',            'Kief extraction',       'extraction',  'A', 'TRIM',      'KIEF',      20.00, 3.0, false, 1),
  ('IWE_EXTRACTION',   'Extraction IWE',                'IWE extraction',        'extraction',  'B', 'TRIM',      'TRICHOMES', 10.00, 3.0, false, 2),
  ('TRICHOME_DRYING',  'Séchage des trichomes',         'Trichome drying',       'drying',      'C', 'TRICHOMES', 'TRICHOMES', null,  2.0, false, 3),
  ('HASH_FORMULATION', 'Formulation de hash (kief)',    'Hash formulation',      'formulation', 'B', 'KIEF',      'HASH',      null,  1.5, true,  4),
  ('IWE_HASH_FORM',    'Formulation de hash IWE',       'IWE hash formulation',  'formulation', 'B', 'TRICHOMES', 'IWE_HASH',  null,  1.5, true,  5),
  ('ROSIN_PRESSING',   'Pressage rosin',                'Rosin pressing',        'pressing',    'C', 'TRICHOMES', 'ROSIN',     60.00, 1.5, false, 6),
  ('PACKAGING',        'Emballage',                     'Packaging',             'packaging',   'A', null,        null,        null,  1.5, false, 7)
) as v(code, name_fr, name_en, kind, room_code, in_code, out_code, yield_pct, duration_days, is_formulation, sort_order)
left join ops_rooms r      on r.code  = v.room_code
left join ops_materials mi on mi.code = v.in_code
left join ops_materials mo on mo.code = v.out_code;

-- Reusable blend templates (e.g. "40% kief A / 60% kief B / 5% distillate").
create table ops_recipes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  process_type_id  uuid not null references ops_process_types(id),
  output_material_id uuid references ops_materials(id),
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table ops_recipe_components (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references ops_recipes(id) on delete cascade,
  material_id  uuid not null references ops_materials(id),
  proportion_pct numeric(6,3) not null,
  notes        text
);

create index ops_recipe_components_recipe_idx on ops_recipe_components (recipe_id);

-- ============================================================
-- Customers
-- ============================================================

create table ops_customers (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  short_code              text unique,
  customer_type           ops_customer_type not null,
  -- SQDC / OCS need a case GTIN and units per case on every packaging run.
  requires_case_gtin      boolean not null default false,
  default_excise_province text,
  payment_terms           text,
  contact_name            text,
  contact_email           text,
  notes                   text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);

create table ops_customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references ops_customers(id) on delete cascade,
  label       text,
  line1       text not null,
  line2       text,
  city        text,
  province    text,
  postal_code text,
  country     text not null default 'Canada',
  is_default  boolean not null default false
);

create index ops_customer_addresses_customer_idx on ops_customer_addresses (customer_id);

insert into ops_customers (name, short_code, customer_type, requires_case_gtin, default_excise_province) values
  ('SQDC',                'SQDC',   'provincial_distributor', true,  'QC'),
  ('OCS',                 'OCS',    'provincial_distributor', true,  'ON'),
  ('Médicibis / Mendo',   'MEDI',   'medical_platform',       false, null),
  ('Rosebud / Herbal Dispatch', 'ROSE', 'medical_platform',   false, null),
  ('Teedy',               'TEEDY',  'medical_platform',       false, null),
  ('Kanach',              'KANACH', 'medical_platform',       false, null),
  ('Optimus',             'OPTIM',  'medical_platform',       false, null),
  ('Flodega / Lot420',    'FLOD',   'medical_platform',       false, null),
  ('Réapprovisionnement interne', 'INT', 'internal',          false, null);

-- ============================================================
-- Product / SKU catalogue
-- ============================================================

create table ops_products (
  id                 uuid primary key default gen_random_uuid(),
  brand              text,
  name               text not null,
  material_id        uuid references ops_materials(id),
  product_type       text,                       -- Hash, Rosin Vape, Flower, Topical, …
  sku_size_g         numeric(10,3),              -- null = bulk
  is_bulk            boolean not null default false,
  gtin               text,
  case_gtin          text,
  units_per_case     int,
  requires_excise    boolean not null default true,
  is_rotational      boolean not null default false,  -- cultivar must be named on the label
  platform_refs      text,                       -- per-platform item numbers, free text for now
  platforms          text,                       -- where it is listed today
  status             text not null default 'active',  -- active | new | delisted | not_listed
  monday_item_id     text,                       -- provenance for the seeded rows
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index ops_products_brand_idx  on ops_products (brand);
create index ops_products_status_idx on ops_products (status);
create unique index ops_products_gtin_uniq on ops_products (gtin) where gtin is not null;

create trigger ops_products_touch_updated_at
before update on ops_products
for each row execute function touch_updated_at();

-- ============================================================
-- Lots — stable identity, whatever upstream systems do
-- ============================================================

create table ops_lots (
  id             uuid primary key default gen_random_uuid(),
  -- Assigned once by Oaziz. NEVER changes, whatever state the material reaches.
  lot_code       text not null unique,
  material_id    uuid not null references ops_materials(id),
  state          ops_lot_state not null default 'received',
  origin         ops_lot_origin not null default 'produced',
  cultivar       text,
  supplier_name  text,
  received_at    date,
  produced_at    date,
  -- Running quantity maintained from ops_lot_movements; advisory, not authoritative
  -- until the ledger is the system of record.
  qty_on_hand_g  numeric(14,3) not null default 0,
  qty_on_hand_units int,
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index ops_lots_material_idx on ops_lots (material_id);
create index ops_lots_state_idx    on ops_lots (state);

create trigger ops_lots_touch_updated_at
before update on ops_lots
for each row execute function touch_updated_at();

-- The whole point: lot_code is write-once.
create or replace function ops_lots_lock_code()
returns trigger language plpgsql as $$
begin
  if new.lot_code is distinct from old.lot_code then
    raise exception 'ops_lots.lot_code is immutable (was %, tried %). Record the other system''s number in ops_lot_aliases instead.',
      old.lot_code, new.lot_code;
  end if;
  return new;
end;
$$;

create trigger ops_lots_lot_code_immutable
before update on ops_lots
for each row execute function ops_lots_lock_code();

-- Numbers the same physical material carries in other systems.
create table ops_lot_aliases (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references ops_lots(id) on delete cascade,
  system       ops_alias_system not null,
  external_ref text not null,
  note         text,
  recorded_at  timestamptz not null default now(),
  unique (system, external_ref)
);

create index ops_lot_aliases_lot_idx on ops_lot_aliases (lot_id);

comment on table ops_lot_aliases is
  'When GrowerIQ renumbers a batch on state change, add the new number here. The Oaziz lot_code and its lineage are unaffected.';

create table ops_lot_potency (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references ops_lots(id) on delete cascade,
  thc_pct      numeric(6,3),
  cbd_pct      numeric(6,3),
  other        jsonb not null default '{}'::jsonb,   -- CBG, THCV, …
  source       ops_potency_source not null,
  coa_ref      text,
  tested_at    date,
  recorded_at  timestamptz not null default now()
);

create index ops_lot_potency_lot_idx on ops_lot_potency (lot_id, recorded_at desc);

-- Genealogy: which lot became which. Many-to-many, because formulations merge.
create table ops_lot_links (
  id            uuid primary key default gen_random_uuid(),
  parent_lot_id uuid not null references ops_lots(id) on delete cascade,
  child_lot_id  uuid not null references ops_lots(id) on delete cascade,
  stage_id      uuid,
  created_at    timestamptz not null default now(),
  unique (parent_lot_id, child_lot_id)
);

create index ops_lot_links_parent_idx on ops_lot_links (parent_lot_id);
create index ops_lot_links_child_idx  on ops_lot_links (child_lot_id);

-- ============================================================
-- The movement ledger — append-only
-- ============================================================

create table ops_lot_movements (
  id                  uuid primary key default gen_random_uuid(),
  lot_id              uuid not null references ops_lots(id),
  direction           ops_movement_direction not null,
  qty_g               numeric(14,3),
  qty_units           int,
  stage_id            uuid,
  loss_reason         ops_loss_reason,
  actor_staff_id      uuid references staff(id),
  actor_email         text,
  occurred_at         timestamptz not null default now(),
  recorded_at         timestamptz not null default now(),
  -- A correction is a new reversing row, never an edit.
  reverses_movement_id uuid references ops_lot_movements(id),
  note                text,
  metadata            jsonb not null default '{}'::jsonb
);

create index ops_lot_movements_lot_idx   on ops_lot_movements (lot_id, occurred_at desc);
create index ops_lot_movements_stage_idx on ops_lot_movements (stage_id);

comment on table ops_lot_movements is
  'Append-only. No UPDATE or DELETE policy exists by design — this is the record that makes Atelier the live layer, and later the system of record.';

create or replace function ops_movements_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ops_lot_movements is append-only. Insert a reversing row (reverses_movement_id) instead of editing or deleting.';
end;
$$;

create trigger ops_lot_movements_no_update
before update on ops_lot_movements
for each row execute function ops_movements_block_mutation();

create trigger ops_lot_movements_no_delete
before delete on ops_lot_movements
for each row execute function ops_movements_block_mutation();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table ops_rooms              enable row level security;
alter table ops_materials          enable row level security;
alter table ops_process_types      enable row level security;
alter table ops_recipes            enable row level security;
alter table ops_recipe_components  enable row level security;
alter table ops_customers          enable row level security;
alter table ops_customer_addresses enable row level security;
alter table ops_products           enable row level security;
alter table ops_lots               enable row level security;
alter table ops_lot_aliases        enable row level security;
alter table ops_lot_potency        enable row level security;
alter table ops_lot_links          enable row level security;
alter table ops_lot_movements      enable row level security;

-- Everyone signed in reads everything: the whole point is shared visibility.
do $$
declare t text;
begin
  foreach t in array array[
    'ops_rooms','ops_materials','ops_process_types','ops_recipes','ops_recipe_components',
    'ops_customers','ops_customer_addresses','ops_products','ops_lots','ops_lot_aliases',
    'ops_lot_potency','ops_lot_links','ops_lot_movements'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_read_authenticated', t
    );
  end loop;
end $$;

-- Reference/settings data is written by admin + production manager only.
do $$
declare t text;
begin
  foreach t in array array[
    'ops_rooms','ops_materials','ops_process_types','ops_recipes','ops_recipe_components',
    'ops_customers','ops_customer_addresses','ops_products'
  ] loop
    execute format(
      'create policy %I on %I for all to authenticated using (ops_can_manage()) with check (ops_can_manage())',
      t || '_manage', t
    );
  end loop;
end $$;

-- Lot data: anyone in production, QA, shipping or management may record it.
do $$
declare t text;
begin
  foreach t in array array['ops_lots','ops_lot_aliases','ops_lot_potency','ops_lot_links'] loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (ops_current_role() is not null) with check (ops_current_role() is not null)',
      t || '_write', t
    );
  end loop;
end $$;

-- Movements: insert only. The absence of update/delete policies is deliberate,
-- and the triggers above make it enforceable even for the service role.
create policy ops_lot_movements_insert on ops_lot_movements
  for insert to authenticated
  with check (ops_current_role() is not null);
