-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 15:56:49 UTC as version 20260928155649
-- ("atelier_excise_stamp_inventory") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — excise stamp inventory, for Part D of the B300.
--
-- Part D is a ledger in its own right, per province: opening, received, used on
-- products, unusable, adjustments, closing — and CRA holds the licensee to the
-- count. Oaziz's August return carried stamps for Ontario and Quebec only, but
-- every jurisdiction is modelled because a new listing changes that overnight.
--
-- Stamps are counted, not weighed, and they are not cannabis — so this is its own
-- ledger rather than another movement direction on ops_lot_movements. It follows
-- the same rule though: append-only, corrections are reversing entries.

create type ops_stamp_direction as enum (
  'received',    -- ordered from the stamp provider and taken into inventory
  'used',        -- applied to product (normally by a packaging run)
  'unusable',    -- damaged, misprinted, spoiled in application
  'returned',    -- sent back to the provider
  'adjustment'   -- a counted correction, either sign
);

create table ops_stamp_movements (
  id             uuid primary key default gen_random_uuid(),
  province       text not null,
  direction      ops_stamp_direction not null,
  qty            int not null,
  occurred_at    timestamptz not null default now(),
  -- What caused it: the packaging run that used them, or the order reference the
  -- stamps arrived against.
  packaging_run_id uuid references ops_packaging_runs(id),
  reference      text,
  note           text,
  actor_staff_id uuid references staff(id),
  actor_email    text,
  created_at     timestamptz not null default now(),
  constraint ops_stamp_movements_qty_nonzero check (qty <> 0),
  -- Only an adjustment may be negative; everything else is a direction plus a count.
  constraint ops_stamp_movements_sign
    check (direction = 'adjustment' or qty > 0)
);

create index ops_stamp_movements_prov_idx on ops_stamp_movements (province, occurred_at);
create index ops_stamp_movements_run_idx  on ops_stamp_movements (packaging_run_id);

comment on table ops_stamp_movements is
  'Excise stamp ledger, per province. Append-only like the lot ledger: a miscount is corrected with an adjustment, never by editing the entry.';

create or replace function ops_stamp_block_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'ops_stamp_movements is append-only. Record an adjustment instead of changing an entry.';
end;
$fn$;

create trigger ops_stamp_movements_no_update
before update on ops_stamp_movements
for each row execute function ops_stamp_block_mutation();

create trigger ops_stamp_movements_no_delete
before delete on ops_stamp_movements
for each row execute function ops_stamp_block_mutation();

alter table ops_stamp_movements enable row level security;

create policy ops_stamp_movements_read on ops_stamp_movements
  for select to authenticated using (true);

create policy ops_stamp_movements_write on ops_stamp_movements
  for insert to authenticated
  with check (ops_current_role() is not null);

-- ============================================================
-- Recording stamps
-- ============================================================

create or replace function ops_record_stamps(
  p_province    text,
  p_direction   ops_stamp_direction,
  p_qty         int,
  p_occurred_at date default current_date,
  p_reference   text default null,
  p_note        text default null
)
returns uuid
language plpgsql security invoker set search_path = public as $fn$
declare
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
  v_id    uuid;
  v_hand  int;
begin
  if p_province is null or length(trim(p_province)) <> 2 then
    raise exception 'A two-letter province or territory is required (the stamp is provincial).';
  end if;
  if p_qty is null or p_qty = 0 then
    raise exception 'Record how many stamps.';
  end if;
  if p_direction <> 'adjustment' and p_qty < 0 then
    raise exception 'Only an adjustment can be negative. Use the direction that describes what happened.';
  end if;

  -- You cannot use, spoil or return stamps you do not have.
  if p_direction in ('used', 'unusable', 'returned') then
    select coalesce(sum(case when direction in ('received', 'adjustment') then qty else -qty end), 0)
      into v_hand
      from ops_stamp_movements where province = upper(trim(p_province));
    if p_qty > v_hand then
      raise exception 'Only % % stamps are on hand; this records %.', v_hand, upper(trim(p_province)), p_qty;
    end if;
  end if;

  select id into v_actor from staff where email = v_email;

  insert into ops_stamp_movements
    (province, direction, qty, occurred_at, reference, note, actor_staff_id, actor_email)
  values (
    upper(trim(p_province)), p_direction, p_qty,
    (coalesce(p_occurred_at, current_date)::timestamp) at time zone 'America/Toronto',
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_actor, v_email
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function ops_record_stamps(text, ops_stamp_direction, int, date, text, text) to authenticated;

-- ============================================================
-- Reading
-- ============================================================

-- Balance per province right now.
create view v_ops_stamp_inventory
with (security_invoker = true) as
select
  province,
  coalesce(sum(qty) filter (where direction = 'received'), 0)   as received,
  coalesce(sum(qty) filter (where direction = 'used'), 0)       as used,
  coalesce(sum(qty) filter (where direction = 'unusable'), 0)   as unusable,
  coalesce(sum(qty) filter (where direction = 'returned'), 0)   as returned,
  coalesce(sum(qty) filter (where direction = 'adjustment'), 0) as adjustments,
  coalesce(sum(case when direction in ('received', 'adjustment') then qty else -qty end), 0) as on_hand
from ops_stamp_movements
group by province;

comment on view v_ops_stamp_inventory is
  'Stamps on hand per province. Part D of the B300 needs the same numbers cut to a reporting period — use ops_stamp_period().';

-- Part D for one period: opening, the period's own columns, and closing. Exactly
-- the shape of the form, so the generator has nothing left to work out.
create or replace function ops_stamp_period(p_from date, p_to date)
returns table (
  province          text,
  opening_inventory int,
  received          int,
  used              int,
  unusable          int,
  returned          int,
  adjustments       int,
  closing_inventory int
)
language sql stable security invoker set search_path = public as $$
  with provinces as (
    select distinct province from ops_stamp_movements
  ),
  opening as (
    select province,
           coalesce(sum(case when direction in ('received', 'adjustment') then qty else -qty end), 0)::int as qty
    from ops_stamp_movements
    where occurred_at < (p_from::timestamp at time zone 'America/Toronto')
    group by province
  ),
  during as (
    select province,
           coalesce(sum(qty) filter (where direction = 'received'), 0)::int   as received,
           coalesce(sum(qty) filter (where direction = 'used'), 0)::int       as used,
           coalesce(sum(qty) filter (where direction = 'unusable'), 0)::int   as unusable,
           coalesce(sum(qty) filter (where direction = 'returned'), 0)::int   as returned,
           coalesce(sum(qty) filter (where direction = 'adjustment'), 0)::int as adjustments
    from ops_stamp_movements
    where occurred_at >= (p_from::timestamp at time zone 'America/Toronto')
      and occurred_at <  ((p_to + 1)::timestamp at time zone 'America/Toronto')
    group by province
  )
  select
    p.province,
    coalesce(o.qty, 0),
    coalesce(d.received, 0),
    coalesce(d.used, 0),
    coalesce(d.unusable, 0),
    coalesce(d.returned, 0),
    coalesce(d.adjustments, 0),
    coalesce(o.qty, 0) + coalesce(d.received, 0) + coalesce(d.adjustments, 0)
      - coalesce(d.used, 0) - coalesce(d.unusable, 0) - coalesce(d.returned, 0)
  from provinces p
  left join opening o on o.province = p.province
  left join during  d on d.province = p.province
  order by p.province;
$$;

grant execute on function ops_stamp_period(date, date) to authenticated;

comment on function ops_stamp_period(date, date) is
  'Part D of the B300 for one reporting period: one row per province, laid out as the form asks. Closing = opening + received + adjustments - used - unusable - returned.';
