-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 15:59:47 UTC as version 20260928155947
-- ("atelier_fix_null_role_authorization_hole") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — a QA gate that does not fire when the caller has no role at all.
--
-- Found while testing the period functions. The guards were written as
--
--   if v_role not in ('qa', 'admin') then raise exception ...
--
-- and ops_current_role() returns NULL for anyone without an Atelier role. In SQL,
-- NULL not in ('qa','admin') is NULL, and IF treats NULL as false — so the guard
-- was skipped precisely for the callers it was meant to stop. A user with any real
-- role was checked correctly; one with none was waved through.
--
-- RLS on the underlying tables kept the blast radius small, and the app redirects
-- roleless staff before they reach these paths, so this is a latent hole rather
-- than an open door. It is still exactly the wrong way round for a compliance
-- system, and it affects three functions from the QA release work as well as the
-- three written today.
--
-- Fixed by coalescing to a value that is in no allow-list, applied to the live
-- definitions so no function body has to be retyped and none can drift.

do $$
declare
  fn   text;
  def  text;
  newd text;
begin
  foreach fn in array array[
    'ops_release_lot',
    'ops_conditional_release_lot',
    'ops_unrelease_lot',
    'ops_approve_destruction',
    'ops_open_period',
    'ops_file_period'
  ] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = fn
    limit 1;

    if def is null then
      raise notice 'skipped %, not found', fn;
      continue;
    end if;

    newd := replace(def,
      'if v_role not in (',
      'if coalesce(v_role::text, '''') not in (');
    newd := replace(newd,
      'if ops_current_role() not in (',
      'if coalesce(ops_current_role()::text, '''') not in (');

    if newd = def then
      raise notice 'no guard rewritten in % — check it by hand', fn;
    else
      execute newd;
      raise notice 'guarded %', fn;
    end if;
  end loop;
end $$;

-- Prove it: with no role the gates must now refuse.
do $$
declare ok int := 0; msg text;
begin
  if ops_current_role() is not null then
    raise notice 'running with a role (%), skipping the no-role proof', ops_current_role();
    return;
  end if;

  begin
    perform ops_approve_destruction('00000000-0000-0000-0000-000000000000'::uuid);
  exception when others then
    msg := sqlerrm;
    if msg like '%Only QA%' then ok := ok + 1; else raise notice 'approve_destruction: %', msg; end if;
  end;

  begin
    perform ops_open_period(2099, 1);
  exception when others then
    msg := sqlerrm;
    if msg like '%Only QA%' then ok := ok + 1; else raise notice 'open_period: %', msg; end if;
  end;

  if ok <> 2 then
    raise exception 'The no-role guard is still not firing (% of 2)', ok;
  end if;
  raise notice 'no-role guard fires on both checks';
end $$;
