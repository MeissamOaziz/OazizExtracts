-- Atelier — the test-data wipe named the ledger's guards wrongly.
--
-- Found 2026-10-08, straight after 0069 let it run as the owner: it then failed
-- with 'trigger "ops_movements_no_update" for table "ops_lot_movements" does not
-- exist'. The guards on that table are ops_lot_movements_no_update / _no_delete;
-- only the stamp ledger's names were right. So, like 0069's problem, this function
-- could never have completed.
--
-- The guards are now located by the function they execute instead of by name,
-- and the wipe refuses to touch anything unless it finds exactly the four it
-- expects — so a rename can only ever stop it, never let it half-run. Everything
-- else is unchanged. It all runs in one transaction, so any failure part-way
-- leaves every row and every guard exactly as it was.

create or replace function ops_reset_test_data(p_confirm text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_expected text := 'RESET ATELIER ' || to_char(current_date, 'YYYY-MM-DD');
  v_lots int; v_moves int; v_orders int; v_runs int; v_des int; v_periods int;
  v_guards text[] := '{}';
  g record;
begin
  if not ops_is_master_admin() then
    raise exception 'Only a master admin can clear the test data.';
  end if;

  -- Typed back verbatim, with today's date in it, so this cannot be reached by a
  -- stray click or a copied snippet from last week.
  if coalesce(p_confirm, '') <> v_expected then
    raise exception 'To confirm, pass exactly: %', v_expected;
  end if;

  -- Once anything has been filed with CRA, the records behind it are evidence.
  if exists (select 1 from ops_excise_periods where status = 'filed') then
    raise exception 'A return has already been filed, so this is no longer test data. Clearing it is refused.';
  end if;

  select count(*) into v_lots    from ops_lots;
  select count(*) into v_moves   from ops_lot_movements;
  select count(*) into v_orders  from ops_orders;
  select count(*) into v_runs    from ops_packaging_runs;
  select count(*) into v_des     from ops_destructions;
  select count(*) into v_periods from ops_excise_periods;

  -- The append-only guards exist to stop corrections being disguised as edits.
  -- This is neither: it is the deliberate end of the testing phase, and it is the
  -- only place in the system permitted to do it.
  -- The guards are found by the function they run rather than by name: the
  -- names were wrong here once already. Only these are lifted — the audit,
  -- potency and period-lock triggers stay on, so the wipe itself is logged.
  for g in
    select t.tgrelid::regclass::text as tbl, t.tgname
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and p.proname in ('ops_movements_block_mutation', 'ops_stamp_block_mutation')
      and t.tgrelid in ('ops_lot_movements'::regclass, 'ops_stamp_movements'::regclass)
  loop
    execute format('alter table %s disable trigger %I', g.tbl, g.tgname);
    v_guards := v_guards || format('%s.%s', g.tbl, g.tgname);
  end loop;
  if cardinality(v_guards) <> 4 then
    raise exception 'Expected 4 append-only guards on the ledgers, found %: %. Nothing was cleared.',
      cardinality(v_guards), v_guards;
  end if;

  delete from ops_excise_period_balances;
  delete from ops_excise_periods;
  delete from ops_stamp_movements;

  delete from ops_destruction_lines;
  delete from ops_destructions;
  delete from ops_packaging_runs;

  delete from ops_lab_samples;
  delete from ops_lot_links;
  delete from ops_lot_potency;
  delete from ops_lot_aliases;
  delete from ops_lot_attachments;
  delete from ops_lot_movements;

  delete from ops_stage_losses;
  delete from ops_stage_inputs;
  delete from ops_stage_outputs;
  delete from ops_stage_deps;
  delete from ops_wo_stages;
  delete from ops_work_orders;

  delete from ops_holds;
  delete from ops_events;
  delete from ops_order_attachments;
  delete from ops_refill_specs;
  delete from ops_order_lines;
  delete from ops_orders;

  delete from ops_lots;

  -- Numbering starts again from one, so the first real lot is not OAZ-2026-0042.
  delete from ops_counters;

  for g in
    select t.tgrelid::regclass::text as tbl, t.tgname
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and p.proname in ('ops_movements_block_mutation', 'ops_stamp_block_mutation')
      and t.tgrelid in ('ops_lot_movements'::regclass, 'ops_stamp_movements'::regclass)
  loop
    execute format('alter table %s enable trigger %I', g.tbl, g.tgname);
  end loop;

  -- The audit log is deliberately NOT cleared: how the system behaved during
  -- testing is worth keeping, and it is the one table that should never be wiped.
  return format(
    'Cleared: %s lots, %s movements, %s orders, %s packaging runs, %s destructions, %s periods. Catalogues and the audit log were kept.',
    v_lots, v_moves, v_orders, v_runs, v_des, v_periods
  );
end;
$fn$;

revoke execute on function ops_reset_test_data(text) from public, anon;
grant execute on function ops_reset_test_data(text) to authenticated;

comment on function ops_reset_test_data(text) is
  'End of the testing phase: clears every transaction and leaves the catalogues and the audit log. Master admin only, refuses once any return is filed, and requires the confirmation phrase with today''s date.';
