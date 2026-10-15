-- Production: shipping work orders (bon de travail d'expédition, F2-QAS-001).
--
-- A customer PO or packaging request gets one shipping work order. It is
-- prefilled from the PO (read by Claude), checked by whoever entered the
-- request, then sent to production as a printable PDF. Production fills the
-- paper by hand while preparing the order, photographs it, and the portal reads
-- the photo back into the work order; once checked, a copy goes to the people
-- picked (logistics books the shipment from it).
--
-- Same rules as the rest of the module: nothing is deleted (cancelled
-- instead), every change is one row of an append-only log, and access goes
-- through the service role only.

create type ps_swo_status as enum ('draft', 'sent', 'completed', 'cancelled');

create table ps_swo_counters (
  year int primary key,
  last int not null
);

create table ps_swos (
  id uuid primary key default gen_random_uuid(),
  swo_no text not null unique,
  request_id uuid not null unique references ps_requests(id),
  status ps_swo_status not null default 'draft',
  -- Header, as on the paper form.
  order_date date,
  packaging_date date,
  customer_name text,
  customer_po text,
  prepared_by text,
  preparation_date date,
  notes text,
  -- What Claude read from the PO and from the completed sheet, kept as read.
  po_extraction jsonb,
  sheet_extraction jsonb,
  -- The photo(s) of the completed paper, in the private "production" bucket.
  sheet_paths text[] not null default '{}',
  version int not null default 1,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references staff(id),
  completed_at timestamptz,
  completed_by uuid references staff(id),
  copy_sent_to text[] not null default '{}',
  cancelled_at timestamptz,
  cancel_reason text
);

create table ps_swo_lines (
  id uuid primary key default gen_random_uuid(),
  swo_id uuid not null references ps_swos(id) on delete cascade,
  sort_order int not null default 0,
  product_name text not null check (length(trim(product_name)) > 0),
  cultivar text,
  product_type text,
  lot_no text,
  sku_size_g numeric(10,3),
  packaging_run_id text,
  excise_province text,
  packaging_lot_no text,
  po_quantity numeric(14,3),
  final_quantity numeric(14,3),
  box_no text,
  box_size text,
  box_weight text
);
create index ps_swo_lines_swo on ps_swo_lines (swo_id);

create table ps_swo_events (
  id bigint generated always as identity primary key,
  swo_id uuid not null references ps_swos(id),
  at timestamptz not null default now(),
  staff_id uuid references staff(id),
  kind text not null check (kind in (
    'created', 'updated', 'sent', 'sheet_uploaded', 'completed', 'copy_sent', 'cancelled', 'reopened')),
  note text,
  changes jsonb not null default '{}'::jsonb
);
create index ps_swo_events_swo on ps_swo_events (swo_id, at);

create trigger ps_swo_events_append_only
  before update or delete on ps_swo_events
  for each row execute function ps_refuse('ps_swo_events is append-only.');
create trigger ps_swos_never_deleted
  before delete on ps_swos
  for each row execute function ps_refuse('Shipping work orders are cancelled, never deleted.');

alter table ps_swo_counters enable row level security;
alter table ps_swos enable row level security;
alter table ps_swo_lines enable row level security;
alter table ps_swo_events enable row level security;
revoke all on ps_swo_counters, ps_swos, ps_swo_lines, ps_swo_events from anon, authenticated;
