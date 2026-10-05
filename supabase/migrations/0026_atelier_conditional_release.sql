-- Atelier — conditional release (shipping under quarantine).
--
-- Meissam, 2026-09-08:
--   "It does happen that we ship batches to customers under exceptional
--    conditional release, which means we ship in quarantine and release
--    afterwards, once we receive the lab results. This is done if customers are
--    in a rush and they agree to receive under conditional release."
--
-- So the gate has three positions, not two:
--
--   batch       — not shippable, not sellable
--   conditional — shipped in quarantine, results pending, customer has agreed
--   released    — COA on file, unrestricted
--
-- Conditional release deliberately does NOT require a COA (the whole point is
-- that results are outstanding), but it does require three things that make it
-- defensible after the fact: QA approval, a recorded reason, and the customer's
-- documented agreement. It also requires that a sample has actually gone to the
-- lab — "pending results" is not true if nothing was ever sent.

alter table ops_lots add column if not exists conditional_at            timestamptz;
alter table ops_lots add column if not exists conditional_by_staff_id   uuid references staff(id);
alter table ops_lots add column if not exists conditional_reason        text;
alter table ops_lots add column if not exists customer_acknowledged     boolean not null default false;

-- One derived field the whole app can read, so nothing has to re-derive the
-- precedence rule. A full release always outranks a conditional one.
alter table ops_lots add column if not exists release_status text
  generated always as (
    case
      when released_at is not null    then 'released'
      when conditional_at is not null then 'conditional'
      else 'batch'
    end
  ) stored;

create index if not exists ops_lots_release_status_idx on ops_lots (release_status);

comment on column ops_lots.conditional_at is
  'Shipped in quarantine pending lab results, with the customer''s agreement. Superseded once released_at is set; kept afterwards as history.';

-- ============================================================
-- Grant a conditional release
-- ============================================================

create or replace function ops_conditional_release_lot(
  p_lot          uuid,
  p_reason       text,
  p_customer_ack boolean default false,
  p_notes        text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_email    text := auth.jwt() ->> 'email';
  v_actor    uuid;
  v_role     ops_role;
  v_released timestamptz;
  v_cond     timestamptz;
  v_samples  int;
begin
  select ops_current_role() into v_role;
  if v_role not in ('qa', 'admin') then
    raise exception 'Only QA can grant a conditional release.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A conditional release needs a documented reason.';
  end if;
  if p_customer_ack is not true then
    raise exception 'The customer must have agreed to receive under conditional release.';
  end if;

  select released_at, conditional_at into v_released, v_cond
  from ops_lots where id = p_lot for update;
  if not found then raise exception 'Unknown lot %', p_lot; end if;
  if v_released is not null then raise exception 'This lot is already fully released.'; end if;
  if v_cond is not null then raise exception 'This batch is already under conditional release.'; end if;

  -- "Pending results" is only true if something actually went to the lab.
  select count(*) into v_samples
  from ops_lab_samples s
  where s.lot_id = p_lot and s.status <> 'cancelled';
  if v_samples = 0 then
    raise exception 'Send a sample to the lab before releasing conditionally — there are no pending results otherwise.';
  end if;

  select id into v_actor from staff where email = v_email;

  update ops_lots
     set conditional_at = now(),
         conditional_by_staff_id = v_actor,
         conditional_reason = trim(p_reason),
         customer_acknowledged = true,
         release_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), release_notes)
   where id = p_lot;
end;
$fn$;

grant execute on function ops_conditional_release_lot(uuid, text, boolean, text) to authenticated;

-- ============================================================
-- Revoke it — the results came back out of spec
-- ============================================================

-- This is the recall trigger: the material is already at the customer, so the
-- lot goes on hold and the reason is on the record.
create or replace function ops_revoke_conditional_release(p_lot uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_role  ops_role;
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
begin
  select ops_current_role() into v_role;
  if v_role not in ('qa', 'admin') then
    raise exception 'Only QA can revoke a conditional release.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Revoking a conditional release needs a reason.';
  end if;

  select id into v_actor from staff where email = v_email;

  update ops_lots
     set conditional_at = null,
         conditional_by_staff_id = null,
         conditional_reason = trim(p_reason),
         state = 'on_hold'
   where id = p_lot and conditional_at is not null and released_at is null;

  if not found then
    raise exception 'That lot is not under conditional release.';
  end if;

  insert into ops_holds (entity_type, entity_id, reason, held_by_staff_id, prev_lot_state)
  values ('lot', p_lot, 'Libération conditionnelle révoquée — ' || trim(p_reason), v_actor, 'on_hold')
  on conflict do nothing;
end;
$fn$;

grant execute on function ops_revoke_conditional_release(uuid, text) to authenticated;

-- ============================================================
-- Views: surface the three-position gate
-- ============================================================

drop view if exists v_ops_inventory;
drop view if exists v_ops_lot_ledger cascade;

create view v_ops_lot_ledger
with (security_invoker = true) as
select
  l.id, l.lot_code, l.state, l.origin, l.cultivar, l.supplier_name,
  l.is_released, l.released_at, l.coa_ref,
  l.release_status, l.conditional_at, l.conditional_reason, l.customer_acknowledged,
  rb.full_name as released_by,
  cb.full_name as conditional_by,
  m.code as material_code, m.name_fr as material_fr, m.name_en as material_en,
  m.category as material_category, m.is_cannabis,
  l.created_at::date as date_created, l.received_at as date_received, l.produced_at as date_produced,
  coalesce(mv.received_g, 0)  as received_g,
  coalesce(mv.produced_g, 0)  as produced_g,
  coalesce(mv.consumed_g, 0)  as consumed_g,
  coalesce(mv.shipped_g, 0)   as shipped_g,
  coalesce(mv.sampled_g, 0)   as sampled_g,
  coalesce(mv.adjusted_g, 0)  as adjusted_g,
  coalesce(mv.received_g, 0) + coalesce(mv.produced_g, 0) + coalesce(mv.adjusted_g, 0)
    - coalesce(mv.consumed_g, 0) - coalesce(mv.shipped_g, 0) - coalesce(mv.sampled_g, 0)
                              as computed_on_hand_g,
  l.qty_on_hand_g             as recorded_on_hand_g,
  pot.thc_pct, pot.cbd_pct, pot.source as potency_source,
  (select count(*) from ops_lot_links k where k.child_lot_id  = l.id) as parent_count,
  (select count(*) from ops_lot_links k where k.parent_lot_id = l.id) as child_count,
  (select count(*) from ops_lab_samples s
    where s.lot_id = l.id and s.status <> 'cancelled')                as sample_count,
  (select count(*) from ops_lab_samples s
    where s.lot_id = l.id and s.status in ('prepared', 'sent'))       as pending_sample_count,
  (select string_agg(a.external_ref, ', ' order by a.recorded_at)
     from ops_lot_aliases a where a.lot_id = l.id) as external_refs
from ops_lots l
join ops_materials m on m.id = l.material_id
left join staff rb on rb.id = l.released_by_staff_id
left join staff cb on cb.id = l.conditional_by_staff_id
left join lateral (
  select
    sum(qty_g) filter (where direction = 'received')   as received_g,
    sum(qty_g) filter (where direction = 'produced')   as produced_g,
    sum(qty_g) filter (where direction = 'consumed')   as consumed_g,
    sum(qty_g) filter (where direction = 'shipped')    as shipped_g,
    sum(qty_g) filter (where direction = 'sample')     as sampled_g,
    sum(qty_g) filter (where direction = 'adjustment') as adjusted_g
  from ops_lot_movements v where v.lot_id = l.id
) mv on true
left join lateral (
  select p.thc_pct, p.cbd_pct, p.source
  from ops_lot_potency p where p.lot_id = l.id
  order by p.recorded_at desc limit 1
) pot on true;

comment on view v_ops_lot_ledger is
  'One row per batch/lot. release_status is batch | conditional | released. Conditional means shipped in quarantine with results outstanding.';

create view v_ops_inventory
with (security_invoker = true) as
select
  l.id, l.lot_code, l.is_released, l.release_status, l.state,
  l.cultivar, l.supplier_name, l.coa_ref, l.conditional_at,
  m.code as material_code, m.name_fr as material_fr, m.name_en as material_en,
  m.category as material_category, m.is_cannabis,
  led.computed_on_hand_g, led.sampled_g,
  led.thc_pct, led.cbd_pct, led.potency_source,
  led.sample_count, led.pending_sample_count,
  l.received_at, l.produced_at, l.released_at
from ops_lots l
join ops_materials m      on m.id = l.material_id
join v_ops_lot_ledger led on led.id = l.id
where led.computed_on_hand_g > 0
  and l.state <> 'destroyed';

comment on view v_ops_inventory is
  'Everything with quantity remaining. Sort by material_category, material name, then thc_pct desc.';

-- Everything shipped but not yet cleared: QA's follow-up list.
create view v_ops_conditional_releases
with (security_invoker = true) as
select
  l.id, l.lot_code, l.conditional_at, l.conditional_reason, l.customer_acknowledged,
  cb.full_name as conditional_by,
  m.code as material_code, m.name_fr as material_fr, m.name_en as material_en,
  l.cultivar,
  (select count(*) from ops_lab_samples s
    where s.lot_id = l.id and s.status in ('prepared', 'sent'))  as pending_samples,
  (select min(s.expected_back) from ops_lab_samples s
    where s.lot_id = l.id and s.status in ('prepared', 'sent'))  as next_result_due
from ops_lots l
join ops_materials m on m.id = l.material_id
left join staff cb   on cb.id = l.conditional_by_staff_id
where l.release_status = 'conditional';

comment on view v_ops_conditional_releases is
  'Lots sitting in quarantine at a customer, waiting on results. QA works this list down to empty.';
