-- The opening movement used `p_received_at::timestamptz`, which reads midnight UTC
-- and therefore displays as the previous evening in Montreal. Interpret the date
-- in the plant's own timezone instead, so a lot received on the 8th says the 8th.
--
-- Existing rows are NOT corrected here. ops_lot_movements is append-only and
-- refuses the update — correctly. A wrong historical entry is fixed with a
-- reversing pair, never by rewriting it.
--
-- (Body identical to 0022's ops_receive_lot apart from v_when. Kept as a full
-- CREATE OR REPLACE so the file is self-contained when replayed.)

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
  v_when  timestamptz;
begin
  if p_material_id is null then
    raise exception 'A material is required to receive a lot.';
  end if;
  if p_qty_g is null or p_qty_g <= 0 then
    raise exception 'Received quantity must be greater than zero.';
  end if;

  select id into v_actor from staff where email = v_email;

  v_when := (coalesce(p_received_at, current_date)::timestamp) at time zone 'America/Toronto';

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
  values (v_lot, 'received', p_qty_g, v_actor, v_email, v_when, 'reception');

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

