-- Atelier — receiving raw material into a lot.
--
-- This is where the traceability chain starts. Trim from a supplier, purchased
-- distillate or isolate, kief bought in — each becomes a lot with an immutable
-- code, an opening ledger entry, its potency, and the numbers other systems use
-- for the same material.
--
-- Receiving is one function rather than four inserts from the app, so a lot can
-- never exist without its opening movement: the ledger and the lot are written
-- in the same transaction or not at all.

create table ops_lot_attachments (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references ops_lots(id) on delete cascade,
  kind         text not null default 'coa',
  storage_path text not null,
  filename     text not null,
  content_type text,
  size_bytes   int,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);

create index ops_lot_attachments_lot_idx on ops_lot_attachments (lot_id);

alter table ops_lot_attachments enable row level security;

create policy ops_lot_attachments_read on ops_lot_attachments
  for select to authenticated using (true);
create policy ops_lot_attachments_write on ops_lot_attachments
  for all to authenticated
  using (ops_current_role() is not null) with check (ops_current_role() is not null);

-- ============================================================
-- Receive
-- ============================================================

create or replace function ops_receive_lot(
  p_material_id     uuid,
  p_qty_g           numeric,
  p_lot_code        text default null,
  p_origin          ops_lot_origin default 'purchased',
  p_supplier        text default null,
  p_received_at     date default current_date,
  p_cultivar        text default null,
  p_thc_pct         numeric default null,
  p_cbd_pct         numeric default null,
  p_potency_source  ops_potency_source default 'supplier',
  p_coa_ref         text default null,
  p_tested_at       date default null,
  p_groweriq_ref    text default null,
  p_supplier_ref    text default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_lot   uuid;
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
begin
  if p_material_id is null then
    raise exception 'A material is required to receive a lot.';
  end if;
  if p_qty_g is null or p_qty_g <= 0 then
    raise exception 'Received quantity must be greater than zero.';
  end if;

  select id into v_actor from staff where email = v_email;

  -- lot_code left null generates <MATERIAL>-<YEAR>-<NNNN> by trigger, and is
  -- immutable from here on.
  insert into ops_lots (
    lot_code, material_id, state, origin, cultivar, supplier_name,
    received_at, qty_on_hand_g, notes, created_by
  ) values (
    nullif(trim(coalesce(p_lot_code, '')), ''),
    p_material_id, 'received', p_origin, p_cultivar, p_supplier,
    p_received_at, p_qty_g, p_notes, v_email
  )
  returning id into v_lot;

  -- Opening balance, so computed_on_hand_g agrees with the running column.
  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, occurred_at, note)
  values (v_lot, 'received', p_qty_g, v_actor, v_email,
          coalesce(p_received_at, current_date)::timestamptz, 'reception');

  if p_thc_pct is not null or p_cbd_pct is not null then
    insert into ops_lot_potency (lot_id, thc_pct, cbd_pct, source, coa_ref, tested_at)
    values (v_lot, p_thc_pct, p_cbd_pct, coalesce(p_potency_source, 'supplier'), p_coa_ref, p_tested_at);
  end if;

  -- The same physical material under other systems' numbers. GrowerIQ renaming
  -- its own reference later is absorbed here, never by changing lot_code.
  if nullif(trim(coalesce(p_groweriq_ref, '')), '') is not null then
    insert into ops_lot_aliases (lot_id, system, external_ref)
    values (v_lot, 'groweriq', trim(p_groweriq_ref))
    on conflict (system, external_ref) do nothing;
  end if;
  if nullif(trim(coalesce(p_supplier_ref, '')), '') is not null then
    insert into ops_lot_aliases (lot_id, system, external_ref)
    values (v_lot, 'supplier', trim(p_supplier_ref))
    on conflict (system, external_ref) do nothing;
  end if;

  return v_lot;
end;
$fn$;

grant execute on function ops_receive_lot(
  uuid, numeric, text, ops_lot_origin, text, date, text,
  numeric, numeric, ops_potency_source, text, date, text, text, text
) to authenticated;

-- ============================================================
-- Correct a quantity
-- ============================================================

-- Corrections are reversing entries, never edits: the ledger is append-only, and
-- a recount that quietly overwrote history would defeat the point of it.
create or replace function ops_adjust_lot(
  p_lot     uuid,
  p_delta_g numeric,
  p_reason  text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
begin
  if p_delta_g is null or p_delta_g = 0 then
    raise exception 'An adjustment needs a non-zero quantity.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'An adjustment needs a reason.';
  end if;

  select id into v_actor from staff where email = v_email;

  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, note)
  values (p_lot, 'adjustment', p_delta_g, v_actor, v_email, trim(p_reason));

  update ops_lots
     set qty_on_hand_g = greatest(qty_on_hand_g + p_delta_g, 0)
   where id = p_lot;
end;
$fn$;

grant execute on function ops_adjust_lot(uuid, numeric, text) to authenticated;
