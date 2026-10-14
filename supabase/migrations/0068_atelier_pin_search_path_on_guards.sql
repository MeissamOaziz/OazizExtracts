-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 16:00:46 UTC as version 20260928160046
-- ("atelier_pin_search_path_on_guards") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Pin the search_path on the two guards added today, matching every other
-- function in the module. They only raise, but a mutable search_path on anything
-- that runs inside someone else's transaction is a loose end the linter is right
-- to flag.

create or replace function ops_audit_block_mutation()
returns trigger language plpgsql set search_path = public as $fn$
begin
  raise exception 'ops_audit_log is append-only. The audit trail is not something that gets corrected.';
end;
$fn$;

create or replace function ops_stamp_block_mutation()
returns trigger language plpgsql set search_path = public as $fn$
begin
  raise exception 'ops_stamp_movements is append-only. Record an adjustment instead of changing an entry.';
end;
$fn$;
