-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-26 11:57:08 UTC as version 20260926115708
-- ("atelier_lot_code_collision_fix") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — a generated lot code must never collide with a hand-typed one.
--
-- Found while testing packaging: TRIM-2026-0001 and TRIM-2026-002 were both typed
-- by hand at receiving, so the 'lot:TRIM:2026' counter was never created. The first
-- lot the system generated for TRIM would therefore have been numbered 0001 and
-- collided with the existing one. Because lot_code is immutable by design, the
-- insert simply fails — production would have hit this the first time a stage or a
-- packaging run produced trim.
--
-- Two parts: seed the counters from what is already on the register, and make the
-- generator step past any number that turns out to be taken anyway.

-- 1. Catch the counters up to the highest number already in use per material/year,
--    including codes that were typed by hand.
insert into ops_counters (scope, last_value)
select 'lot:' || m.code || ':' || to_char(l.created_at at time zone 'America/Toronto', 'YYYY'),
       max(coalesce(nullif(regexp_replace(l.lot_code, '^.*-', ''), '')::int, 0))
from ops_lots l
join ops_materials m on m.id = l.material_id
where l.lot_code ~ ('^' || m.code || '-[0-9]{4}-[0-9]+$')
group by 1
on conflict (scope) do update
  set last_value = greatest(ops_counters.last_value, excluded.last_value);

-- 2. Belt and braces: a code can still be typed by hand tomorrow, so the generator
--    checks the number it drew is actually free and takes the next one if not.
--    Each pass consumes one number, so this always terminates.
create or replace function ops_set_lot_code()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  y         text := to_char(now() at time zone 'America/Toronto', 'YYYY');
  prefix    text;
  n         int;
  candidate text;
begin
  if new.lot_code is not null and new.lot_code <> '' then return new; end if;

  select coalesce(m.code, 'LOT') into prefix from ops_materials m where m.id = new.material_id;

  loop
    insert into ops_counters (scope, last_value) values ('lot:' || prefix || ':' || y, 1)
    on conflict (scope) do update set last_value = ops_counters.last_value + 1
    returning last_value into n;

    candidate := prefix || '-' || y || '-' || lpad(n::text, 4, '0');
    exit when not exists (select 1 from ops_lots where lot_code = candidate);
  end loop;

  new.lot_code := candidate;
  return new;
end;
$fn$;

revoke execute on function ops_set_lot_code() from public, anon, authenticated;
