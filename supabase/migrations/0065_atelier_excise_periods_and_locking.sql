-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 15:57:51 UTC as version 20260928155751
-- ("atelier_excise_periods_and_locking") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — reporting periods, and what it means for one to be filed.
--
-- The B300 is monthly and cumulative: every closing inventory becomes the next
-- month's opening, and CRA holds you to the figure you filed. So a filed period
-- has to stop moving. Without that, someone back-dating a receipt in November
-- silently contradicts what was filed for August, and nobody finds out until an
-- audit.
--
-- A filed period therefore refuses any new movement dated inside it — enforced on
-- the ledger itself, not in the screens — and its closing balances are snapshotted
-- at filing so next month's opening comes from the return that was actually sent,
-- not from a recomputation that might now differ.
--
-- Reopening is possible, because amended returns exist (the form has an "Amended"
-- box). Only the master admin may do it, it needs a reason, and the audit log
-- keeps both the reopening and everything that follows.

create type ops_period_status as enum ('open', 'in_review', 'filed');

create table ops_excise_periods (
  id              uuid primary key default gen_random_uuid(),
  period_year     int  not null,
  period_month    int  not null check (period_month between 1 and 12),
  period_start    date not null,
  period_end      date not null,
  status          ops_period_status not null default 'open',

  -- Filing
  filed_at            timestamptz,
  filed_by_staff_id   uuid references staff(id),
  confirmation_no     text,
  amount_owing        numeric(14,2),
  is_amended          boolean not null default false,

  -- Reopening, when an amended return is needed
  reopened_at         timestamptz,
  reopened_by_staff_id uuid references staff(id),
  reopen_reason       text,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (period_year, period_month)
);

create trigger ops_excise_periods_touch_updated_at
before update on ops_excise_periods
for each row execute function touch_updated_at();

comment on table ops_excise_periods is
  'One row per B300 reporting month. A filed period is locked: the ledger refuses movements dated inside it.';

-- The closing position as filed, which is next month's opening.
create table ops_excise_period_balances (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references ops_excise_periods(id) on delete cascade,
  excise_class  ops_excise_class not null,
  is_packaged   boolean not null,
  qty_g         numeric(16,3) not null default 0,
  mg_thc        numeric(18,3) not null default 0,
  unique (period_id, excise_class, is_packaged)
);

comment on table ops_excise_period_balances is
  'Closing inventory per B300 class as filed. Kept so the next period opens from what was actually reported rather than from a recomputation.';

alter table ops_excise_periods         enable row level security;
alter table ops_excise_period_balances enable row level security;

create policy ops_excise_periods_read on ops_excise_periods
  for select to authenticated using (true);
create policy ops_excise_period_balances_read on ops_excise_period_balances
  for select to authenticated using (true);

-- Only QA and admin touch the return; filing and reopening are gated further in
-- the functions.
create policy ops_excise_periods_write on ops_excise_periods
  for all to authenticated
  using (ops_current_role() in ('qa', 'admin'))
  with check (ops_current_role() in ('qa', 'admin'));
create policy ops_excise_period_balances_write on ops_excise_period_balances
  for all to authenticated
  using (ops_current_role() in ('qa', 'admin'))
  with check (ops_current_role() in ('qa', 'admin'));

-- ============================================================
-- The balance every B300 figure is built from
-- ============================================================

-- On-hand per B300 class as at the end of a given day, in both units: grams for
-- the kg classes, milligrams of total THC for the finished classes. The mg figure
-- uses the potency stamped on each movement, so a later retest cannot move it.
create or replace function ops_excise_balance_at(p_as_of date)
returns table (
  excise_class ops_excise_class,
  is_packaged  boolean,
  qty_g        numeric,
  mg_thc       numeric
)
language sql stable security invoker set search_path = public as $$
  select
    m2.excise_class,
    m2.is_packaged,
    sum(m2.signed_g)  as qty_g,
    sum(m2.signed_mg) as mg_thc
  from (
    select
      mat.excise_class,
      (l.product_id is not null) as is_packaged,
      case when mv.direction in ('received', 'produced', 'adjustment')
           then mv.qty_g else -mv.qty_g end as signed_g,
      case when mv.direction in ('received', 'produced', 'adjustment')
           then mv.qty_g else -mv.qty_g end * coalesce(mv.total_thc_mg_g, 0) as signed_mg
    from ops_lot_movements mv
    join ops_lots l       on l.id = mv.lot_id
    join ops_materials mat on mat.id = l.material_id
    where mv.occurred_at < ((p_as_of + 1)::timestamp at time zone 'America/Toronto')
      and mat.excise_class <> 'not_cannabis'
  ) m2
  group by m2.excise_class, m2.is_packaged;
$$;

grant execute on function ops_excise_balance_at(date) to authenticated;

comment on function ops_excise_balance_at(date) is
  'On-hand per B300 class at the close of a day, in grams and in mg of total THC. The mg side uses the potency frozen on each movement.';

-- ============================================================
-- Filing locks the period
-- ============================================================

create or replace function ops_period_containing(p_when timestamptz)
returns ops_excise_periods
language sql stable security invoker set search_path = public as $$
  select p.* from ops_excise_periods p
  where p_when >= (p.period_start::timestamp at time zone 'America/Toronto')
    and p_when <  ((p.period_end + 1)::timestamp at time zone 'America/Toronto')
  limit 1;
$$;

create or replace function ops_guard_filed_period()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare p ops_excise_periods;
begin
  select * into p from ops_period_containing(new.occurred_at);
  if p.id is not null and p.status = 'filed' then
    raise exception 'The % % return has been filed, so nothing dated inside it can change. Reopen the period first if an amended return is needed.',
      to_char(make_date(p.period_year, p.period_month, 1), 'FMMonth'), p.period_year;
  end if;
  return new;
end;
$fn$;

revoke execute on function ops_guard_filed_period() from public, anon, authenticated;

create trigger ops_lot_movements_period_lock
before insert on ops_lot_movements
for each row execute function ops_guard_filed_period();

create trigger ops_stamp_movements_period_lock
before insert on ops_stamp_movements
for each row execute function ops_guard_filed_period();

-- ============================================================
-- Opening, filing, reopening
-- ============================================================

create or replace function ops_open_period(p_year int, p_month int)
returns uuid
language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid; v_start date;
begin
  if ops_current_role() not in ('qa', 'admin') then
    raise exception 'Only QA can open a reporting period.';
  end if;
  v_start := make_date(p_year, p_month, 1);

  insert into ops_excise_periods (period_year, period_month, period_start, period_end)
  values (p_year, p_month, v_start, (v_start + interval '1 month - 1 day')::date)
  on conflict (period_year, period_month) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from ops_excise_periods
     where period_year = p_year and period_month = p_month;
  end if;
  return v_id;
end;
$fn$;

grant execute on function ops_open_period(int, int) to authenticated;

create or replace function ops_file_period(
  p_period          uuid,
  p_confirmation_no text,
  p_amount_owing    numeric default null
)
returns void
language plpgsql security invoker set search_path = public as $fn$
declare p ops_excise_periods; v_actor uuid;
begin
  if ops_current_role() not in ('qa', 'admin') then
    raise exception 'Only QA can file a return.';
  end if;

  select * into p from ops_excise_periods where id = p_period for update;
  if p.id is null then raise exception 'Unknown period %', p_period; end if;
  if p.status = 'filed' then raise exception 'That period has already been filed.'; end if;
  if nullif(trim(coalesce(p_confirmation_no, '')), '') is null then
    raise exception 'Record the CRA confirmation number, so the filing can be traced back.';
  end if;

  select id into v_actor from staff where email = auth.jwt() ->> 'email';

  -- Snapshot the closing position: this is what next month opens from.
  delete from ops_excise_period_balances where period_id = p_period;
  insert into ops_excise_period_balances (period_id, excise_class, is_packaged, qty_g, mg_thc)
  select p_period, b.excise_class, b.is_packaged,
         round(coalesce(b.qty_g, 0), 3), round(coalesce(b.mg_thc, 0), 3)
  from ops_excise_balance_at(p.period_end) b;

  update ops_excise_periods
     set status = 'filed', filed_at = now(), filed_by_staff_id = v_actor,
         confirmation_no = trim(p_confirmation_no),
         amount_owing = p_amount_owing
   where id = p_period;
end;
$fn$;

grant execute on function ops_file_period(uuid, text, numeric) to authenticated;

create or replace function ops_reopen_period(p_period uuid, p_reason text)
returns void
language plpgsql security invoker set search_path = public as $fn$
declare p ops_excise_periods; v_actor uuid;
begin
  -- Reopening a filed return is the one thing that can make a submitted figure
  -- wrong, so it sits with the master admin and nobody else.
  if not ops_is_master_admin() then
    raise exception 'Only a master admin can reopen a filed period.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to reopen a filed period.';
  end if;

  select * into p from ops_excise_periods where id = p_period for update;
  if p.id is null then raise exception 'Unknown period %', p_period; end if;
  if p.status <> 'filed' then raise exception 'That period is not filed.'; end if;

  select id into v_actor from staff where email = auth.jwt() ->> 'email';

  update ops_excise_periods
     set status = 'in_review', is_amended = true,
         reopened_at = now(), reopened_by_staff_id = v_actor,
         reopen_reason = trim(p_reason)
   where id = p_period;
end;
$fn$;

grant execute on function ops_reopen_period(uuid, text) to authenticated;

create view v_ops_excise_periods
with (security_invoker = true) as
select
  p.*,
  to_char(make_date(p.period_year, p.period_month, 1), 'YYYY-MM') as period_label,
  fb.full_name as filed_by,
  rb.full_name as reopened_by
from ops_excise_periods p
left join staff fb on fb.id = p.filed_by_staff_id
left join staff rb on rb.id = p.reopened_by_staff_id;
