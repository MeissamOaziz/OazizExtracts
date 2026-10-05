-- Advisor fixes for the Atelier objects added in 0014.

-- 1. Pin search_path on the two trigger functions (function_search_path_mutable).
create or replace function ops_lots_lock_code()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.lot_code is distinct from old.lot_code then
    raise exception 'ops_lots.lot_code is immutable (was %, tried %). Record the other system''s number in ops_lot_aliases instead.',
      old.lot_code, new.lot_code;
  end if;
  return new;
end;
$fn$;

create or replace function ops_movements_block_mutation()
returns trigger language plpgsql set search_path = public as $fn$
begin
  raise exception 'ops_lot_movements is append-only. Insert a reversing row (reverses_movement_id) instead of editing or deleting.';
end;
$fn$;

-- 2. The two role helpers do not need SECURITY DEFINER: they only read `staff`,
--    and `authenticated` already has a SELECT policy on it (staff_read_authenticated).
--    Running them as INVOKER clears the "public can execute SECURITY DEFINER
--    function" advisory while leaving RLS behaviour identical — anon sees no staff
--    rows, gets null, and every write policy correctly denies it.
--
--    Note: revoking EXECUTE is NOT an option here. These functions are called from
--    inside RLS policy expressions, which evaluate as the querying role, so the
--    role must retain EXECUTE or every write would fail with "permission denied
--    for function" rather than a clean policy denial.
create or replace function ops_current_role()
returns ops_role language sql stable security invoker set search_path = public as $$
  select s.ops_role from staff s
  where s.email = (auth.jwt() ->> 'email') and s.is_active limit 1;
$$;

create or replace function ops_can_manage()
returns boolean language sql stable security invoker set search_path = public as $$
  select ops_current_role() in ('admin', 'production_manager');
$$;

grant execute on function ops_current_role() to authenticated;
grant execute on function ops_can_manage()  to authenticated;
