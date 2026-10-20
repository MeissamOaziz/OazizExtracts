-- Shipments (Envois): when a shipping work order is completed, a shipment
-- ticket is opened for that PO so the transport can be booked. The booker
-- (permission `shipping`) records the carrier, tracking / BOL number, boxes
-- or pallet and the label; marking the label ready notifies the person who
-- ships, and the ticket is closed once the order has left. Every step is
-- logged in an append-only event table; tickets are cancelled, never deleted.
-- Also adds the room "Autre / Other" to production scheduling.

insert into ps_rooms (code, name_fr, name_en, colour, allows_concurrent, sort_order)
values ('AUTRE', 'Autre', 'Other', '#6b7280', true, 90)
on conflict (code) do nothing;

create type sh_status as enum ('to_book', 'booked', 'label_ready', 'shipped', 'cancelled');

create table sh_counters (
  year int primary key,
  last int not null
);

create table sh_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_no text not null unique,
  swo_id uuid not null unique references ps_swos(id),
  status sh_status not null default 'to_book',
  customer_name text,
  customer_po text,
  ship_to text,
  -- 'boxes' or 'pallet'; the default comes from the customer and box count.
  mode text not null default 'boxes' check (mode in ('boxes', 'pallet')),
  pallets int check (pallets is null or pallets > 0),
  -- [{ "no": "1", "size": "12x12x12", "weight": "15 lbs" }]
  boxes jsonb not null default '[]'::jsonb,
  -- [{ "product": "...", "lot": "74494", "quantity": 2843 }]
  items jsonb not null default '[]'::jsonb,
  carrier text,
  tracking_no text,
  tracking_url text,
  label_paths text[] not null default '{}',
  notes text,
  version int not null default 1,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  booked_at timestamptz,
  booked_by uuid references staff(id),
  label_ready_at timestamptz,
  label_ready_by uuid references staff(id),
  shipped_at timestamptz,
  shipped_by uuid references staff(id),
  cancelled_at timestamptz,
  cancel_reason text
);
create index sh_shipments_status on sh_shipments (status, created_at);

create table sh_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references sh_shipments(id),
  at timestamptz not null default now(),
  staff_id uuid references staff(id),
  kind text not null,
  note text,
  changes jsonb not null default '{}'::jsonb
);
create index sh_events_shipment on sh_events (shipment_id, at);

create trigger sh_events_append_only
  before update or delete on sh_events
  for each row execute function ps_refuse('sh_events is append-only.');
create trigger sh_shipments_never_deleted
  before delete on sh_shipments
  for each row execute function ps_refuse('Shipments are cancelled, never deleted.');

alter table sh_counters enable row level security;
alter table sh_shipments enable row level security;
alter table sh_events enable row level security;
revoke all on sh_counters, sh_shipments, sh_events from anon, authenticated;
