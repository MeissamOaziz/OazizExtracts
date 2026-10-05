-- Atelier — the QA release gate and lab samples.
--
-- Meissam, 2026-09-08:
--   "Before the product becomes a Released Lot, it is considered a Batch, which
--    can't be sold yet because the release documents are missing. Only QA can
--    approve batches and upgrade them as lots."
--
-- Modelled as one physical thing whose designation changes, NOT as two tables:
-- the lot_code is immutable from creation, so a batch and the lot it becomes keep
-- the same identity and the same genealogy. `released_at` is the gate.
--
--   released_at IS NULL  → BATCH   (traceable, sampleable, not sellable)
--   released_at NOT NULL → LOT     (sellable, COA on file, quantity confirmed)
--
-- Samples: anything in batch OR lot form can be sampled, any number of times.
-- Each sample deducts from the quantity on hand, because the material really did
-- leave. R&D samples link back to the existing portal R&D submission.

-- ============================================================
-- The release gate
-- ============================================================

alter table ops_lots add column if not exists released_at         timestamptz;
alter table ops_lots add column if not exists released_by_staff_id uuid references staff(id);
alter table ops_lots add column if not exists release_notes       text;
alter table ops_lots add column if not exists coa_ref             text;

-- Derived so nothing can drift: a lot is released iff it has a release timestamp.
alter table ops_lots add column if not exists is_released boolean
  generated always as (released_at is not null) stored;

create index if not exists ops_lots_released_idx on ops_lots (is_released);

comment on column ops_lots.released_at is
  'QA release. Null means this is still a Batch: traceable and sampleable, but not sellable.';

-- QA (and admin, so the system stays operable) release a batch into a lot.
-- Refuses without a COA — that is the whole point of the gate.
create or replace function ops_release_lot(
  p_lot        uuid,
  p_coa_ref    text default null,
  p_final_qty_g numeric default null,
  p_notes      text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_email   text := auth.jwt() ->> 'email';
  v_actor   uuid;
  v_role    ops_role;
  v_released timestamptz;
  v_onhand  numeric;
  v_hasfile boolean;
  v_coa     text;
begin
  select ops_current_role() into v_role;
  if v_role not in ('qa', 'admin') then
    raise exception 'Only QA can release a batch.';
  end if;

  select released_at, qty_on_hand_g, coa_ref
    into v_released, v_onhand, v_coa
  from ops_lots where id = p_lot for update;

  if not found then raise exception 'Unknown lot %', p_lot; end if;
  if v_released is not null then raise exception 'This batch is already released.'; end if;

  select exists (select 1 from ops_lot_attachments a where a.lot_id = p_lot and a.kind = 'coa')
    into v_hasfile;

  v_coa := coalesce(nullif(trim(coalesce(p_coa_ref, '')), ''), v_coa);
  if v_coa is null and not v_hasfile then
    raise exception 'A COA is required before release: attach the certificate or record its number.';
  end if;

  select id into v_actor from staff where email = v_email;

  -- A confirmed final quantity that differs from the running balance is a real
  -- correction, so it goes through the ledger like any other.
  if p_final_qty_g is not null and p_final_qty_g <> v_onhand then
    insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, note)
    values (p_lot, 'adjustment', p_final_qty_g - v_onhand, v_actor, v_email,
            'quantité finale confirmée à la libération');
    update ops_lots set qty_on_hand_g = p_final_qty_g where id = p_lot;
  end if;

  update ops_lots
     set released_at = now(),
         released_by_staff_id = v_actor,
         release_notes = nullif(trim(coalesce(p_notes, '')), ''),
         coa_ref = v_coa,
         state = 'released'
   where id = p_lot;
end;
$fn$;

grant execute on function ops_release_lot(uuid, text, numeric, text) to authenticated;

-- Undo a release. QA only, and it leaves the reason on the record.
create or replace function ops_unrelease_lot(p_lot uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare v_role ops_role;
begin
  select ops_current_role() into v_role;
  if v_role not in ('qa', 'admin') then
    raise exception 'Only QA can withdraw a release.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Withdrawing a release needs a reason.';
  end if;

  update ops_lots
     set released_at = null,
         released_by_staff_id = null,
         state = 'bulk',
         release_notes = trim(p_reason)
   where id = p_lot and released_at is not null;
end;
$fn$;

grant execute on function ops_unrelease_lot(uuid, text) to authenticated;

-- ============================================================
-- Lab samples
-- ============================================================

create type ops_sample_purpose as enum (
  'release_testing', 'retest', 'stability', 'rnd', 'other'
);

create type ops_sample_status as enum (
  'prepared', 'sent', 'results_received', 'cancelled'
);

create table ops_lab_samples (
  id                 uuid primary key default gen_random_uuid(),
  sample_no          text not null unique,
  lot_id             uuid not null references ops_lots(id),
  purpose            ops_sample_purpose not null default 'release_testing',
  status             ops_sample_status not null default 'prepared',
  qty_g              numeric(14,3) not null check (qty_g > 0),

  lab_name           text,
  sent_at            date,
  expected_back      date,
  results_at         date,
  coa_ref            text,
  thc_pct            numeric(6,3),
  cbd_pct            numeric(6,3),

  -- R&D samples tie back to the portal's existing R&D submission, so the
  -- material movement and the signed form describe the same event.
  rnd_submission_id  uuid references submissions(id) on delete set null,

  requested_by_staff_id uuid references staff(id),
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index ops_lab_samples_lot_idx    on ops_lab_samples (lot_id, created_at desc);
create index ops_lab_samples_status_idx on ops_lab_samples (status);

create trigger ops_lab_samples_touch_updated_at
before update on ops_lab_samples for each row execute function touch_updated_at();

comment on table ops_lab_samples is
  'Every sample drawn from a batch or a lot. Unlimited per lot. The quantity is deducted from the lot because the material physically leaves.';

-- Sample numbering, same trigger pattern as orders and lots.
create or replace function ops_set_sample_no()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  y text := to_char(now() at time zone 'America/Toronto', 'YYYY');
  n int;
begin
  if new.sample_no is not null and new.sample_no <> '' then return new; end if;
  insert into ops_counters (scope, last_value) values ('sample:' || y, 1)
  on conflict (scope) do update set last_value = ops_counters.last_value + 1
  returning last_value into n;
  new.sample_no := 'ECH-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$fn$;

revoke execute on function ops_set_sample_no() from public, anon, authenticated;

create trigger ops_lab_samples_set_no
before insert on ops_lab_samples for each row execute function ops_set_sample_no();

-- Draw a sample: the row and the deduction are written together.
create or replace function ops_create_lab_sample(
  p_lot        uuid,
  p_qty_g      numeric,
  p_purpose    ops_sample_purpose default 'release_testing',
  p_lab_name   text default null,
  p_sent_at    date default null,
  p_expected_back date default null,
  p_rnd_submission_id uuid default null,
  p_notes      text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_email  text := auth.jwt() ->> 'email';
  v_actor  uuid;
  v_sample uuid;
  v_onhand numeric;
begin
  if p_qty_g is null or p_qty_g <= 0 then
    raise exception 'A sample needs a quantity greater than zero.';
  end if;

  select qty_on_hand_g into v_onhand from ops_lots where id = p_lot for update;
  if not found then raise exception 'Unknown lot %', p_lot; end if;
  if p_qty_g > v_onhand then
    raise exception 'Cannot sample % g: only % g on hand.', p_qty_g, v_onhand;
  end if;

  select id into v_actor from staff where email = v_email;

  insert into ops_lab_samples (
    lot_id, qty_g, purpose, lab_name, sent_at, expected_back,
    rnd_submission_id, notes, requested_by_staff_id, created_by,
    status
  ) values (
    p_lot, p_qty_g, coalesce(p_purpose, 'release_testing'), p_lab_name, p_sent_at, p_expected_back,
    p_rnd_submission_id, p_notes, v_actor, v_email,
    (case when p_sent_at is not null then 'sent' else 'prepared' end)::ops_sample_status
  )
  returning id into v_sample;

  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, note, metadata)
  values (p_lot, 'sample', p_qty_g, v_actor, v_email,
          'échantillon ' || (select sample_no from ops_lab_samples where id = v_sample),
          jsonb_build_object('sample_id', v_sample, 'purpose', coalesce(p_purpose, 'release_testing')));

  update ops_lots set qty_on_hand_g = qty_on_hand_g - p_qty_g where id = p_lot;

  return v_sample;
end;
$fn$;

grant execute on function ops_create_lab_sample(
  uuid, numeric, ops_sample_purpose, text, date, date, uuid, text
) to authenticated;

-- Cancelling a sample returns the material with a reversing entry.
create or replace function ops_cancel_lab_sample(p_sample uuid, p_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
  v_lot   uuid;
  v_qty   numeric;
  v_status ops_sample_status;
  v_no    text;
begin
  select lot_id, qty_g, status, sample_no into v_lot, v_qty, v_status, v_no
  from ops_lab_samples where id = p_sample for update;
  if not found then raise exception 'Unknown sample %', p_sample; end if;
  if v_status = 'cancelled' then raise exception 'That sample is already cancelled.'; end if;

  select id into v_actor from staff where email = v_email;

  insert into ops_lot_movements (lot_id, direction, qty_g, actor_staff_id, actor_email, note, metadata)
  values (v_lot, 'adjustment', v_qty, v_actor, v_email,
          'annulation ' || v_no || coalesce(' — ' || nullif(trim(coalesce(p_reason,'')), ''), ''),
          jsonb_build_object('sample_id', p_sample, 'cancelled', true));

  update ops_lots set qty_on_hand_g = qty_on_hand_g + v_qty where id = v_lot;
  update ops_lab_samples set status = 'cancelled', notes =
    coalesce(notes || ' | ', '') || coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'annulé')
  where id = p_sample;
end;
$fn$;

grant execute on function ops_cancel_lab_sample(uuid, text) to authenticated;

alter table ops_lab_samples enable row level security;

create policy ops_lab_samples_read on ops_lab_samples
  for select to authenticated using (true);
create policy ops_lab_samples_write on ops_lab_samples
  for all to authenticated
  using (ops_current_role() is not null) with check (ops_current_role() is not null);

-- ============================================================
-- Views refreshed for samples and the release gate
-- ============================================================

drop view if exists v_ops_lot_ledger;

create view v_ops_lot_ledger
with (security_invoker = true) as
select
  l.id, l.lot_code, l.state, l.origin, l.cultivar, l.supplier_name,
  l.is_released,
  l.released_at, l.coa_ref,
  rb.full_name                             as released_by,
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
  (select count(*) from ops_lab_samples s where s.lot_id = l.id and s.status <> 'cancelled') as sample_count,
  (select string_agg(a.external_ref, ', ' order by a.recorded_at)
     from ops_lot_aliases a where a.lot_id = l.id) as external_refs
from ops_lots l
join ops_materials m on m.id = l.material_id
left join staff rb on rb.id = l.released_by_staff_id
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
  'One row per batch/lot with in, out, sampled and remaining, plus the release state. is_released false means Batch — traceable and sampleable, not sellable.';

-- Inventory: what is actually available to sell or consume, grouped the way
-- Meissam asked — by category, then alphabetically, then by potency.
create view v_ops_inventory
with (security_invoker = true) as
select
  l.id,
  l.lot_code,
  l.is_released,
  l.state,
  l.cultivar,
  l.supplier_name,
  l.coa_ref,
  m.code      as material_code,
  m.name_fr   as material_fr,
  m.name_en   as material_en,
  m.category  as material_category,
  m.is_cannabis,
  led.computed_on_hand_g,
  led.sampled_g,
  led.thc_pct,
  led.cbd_pct,
  led.potency_source,
  led.sample_count,
  l.received_at,
  l.produced_at,
  l.released_at
from ops_lots l
join ops_materials m       on m.id = l.material_id
join v_ops_lot_ledger led  on led.id = l.id
where led.computed_on_hand_g > 0
  and l.state <> 'destroyed';

comment on view v_ops_inventory is
  'Everything with quantity remaining, batches included so nothing is invisible. Sort by material_category, material name, then thc_pct desc.';
