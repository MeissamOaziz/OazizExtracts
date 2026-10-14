-- Atelier — the test-data wipe has to run as the table owner.
--
-- Found 2026-10-08 while checking the wipe still works before go-live: called the
-- way the app would call it (role authenticated, a master admin's JWT), it failed
-- with "must be owner of table ops_lot_movements". It lifts the append-only guards
-- with ALTER TABLE ... DISABLE TRIGGER, which only the table owner may do, and it
-- was declared SECURITY INVOKER — so it could never have run for anyone. The same
-- would have applied to the deletes: no client role has a DELETE policy on the
-- ledger tables, so RLS would have refused them too.
--
-- Now SECURITY DEFINER, so it runs as the owner. Nothing else about it changes, and
-- every gate still runs first inside it: master admin only (ops_is_master_admin()
-- reads the caller's JWT, which a definer function still sees), today's date typed
-- back in the confirmation phrase, and an outright refusal once any period is filed.
--
-- Not covered here, deliberately: files in the private "atelier" storage bucket
-- (PO PDFs, COAs). Their rows go with ops_order_attachments / ops_lot_attachments,
-- but storage objects must be removed through the Storage API, not by SQL.

create or replace function ops_reset_test_data(p_confirm text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_expected text := 'RESET ATELIER ' || to_char(current_date, 'YYYY-MM-DD');
  v_lots int; v_moves int; v_orders int; v_runs int; v_des int; v_periods int;
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
  alter table ops_lot_movements   disable trigger ops_movements_no_update;
  alter table ops_lot_movements   disable trigger ops_movements_no_delete;
  alter table ops_stamp_movements disable trigger ops_stamp_movements_no_update;
  alter table ops_stamp_movements disable trigger ops_stamp_movements_no_delete;

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

  alter table ops_lot_movements   enable trigger ops_movements_no_update;
  alter table ops_lot_movements   enable trigger ops_movements_no_delete;
  alter table ops_stamp_movements enable trigger ops_stamp_movements_no_update;
  alter table ops_stamp_movements enable trigger ops_stamp_movements_no_delete;

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
