-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 15:55:37 UTC as version 20260928155537
-- ("atelier_audit_log") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — an audit trail of every change, kept by the database itself.
--
-- Meissam, 2026-09-28: "we need a record/audit log of all changes throughout."
--
-- Done as a trigger on every table rather than as calls inside the write paths,
-- for the same reason the potency stamp is a trigger: a future writer cannot
-- forget it, and neither can a correction made straight through PostgREST.
--
-- The log is append-only and nobody can write to it directly — the trigger runs
-- SECURITY DEFINER, so it is the only thing that can insert.

create table ops_audit_log (
  id             bigserial primary key,
  table_name     text not null,
  row_id         uuid,
  operation      text not null check (operation in ('insert', 'update', 'delete')),
  actor_email    text,
  actor_staff_id uuid references staff(id),
  -- Only the columns that actually changed, so an update reads at a glance.
  changed_keys   text[],
  old_row        jsonb,
  new_row        jsonb,
  occurred_at    timestamptz not null default now()
);

create index ops_audit_log_row_idx   on ops_audit_log (table_name, row_id, occurred_at desc);
create index ops_audit_log_when_idx  on ops_audit_log (occurred_at desc);
create index ops_audit_log_actor_idx on ops_audit_log (actor_email);

comment on table ops_audit_log is
  'Every insert, update and delete on the Atelier tables, with who did it and exactly which fields moved. Written only by trigger; append-only.';

create or replace function ops_audit()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := auth.jwt() ->> 'email';
  v_actor uuid;
  v_old   jsonb;
  v_new   jsonb;
  v_keys  text[];
  v_id    uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- updated_at moves on every write and says nothing, so it does not count as a
    -- change on its own: an update that touched only it is not logged.
    select array_agg(k order by k) into v_keys
    from jsonb_object_keys(v_new) k
    where (v_new -> k) is distinct from (v_old -> k)
      and k <> 'updated_at';
    if v_keys is null then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
  end if;

  select id into v_actor from staff where email = v_email;
  v_id := coalesce((v_new ->> 'id'), (v_old ->> 'id'))::uuid;

  insert into ops_audit_log
    (table_name, row_id, operation, actor_email, actor_staff_id, changed_keys, old_row, new_row)
  values
    (tg_table_name, v_id, lower(tg_op), v_email, v_actor, v_keys, v_old, v_new);

  return coalesce(new, old);
end;
$fn$;

revoke execute on function ops_audit() from public, anon, authenticated;

-- Attach to every Atelier table plus staff. Skipped: the log itself, and
-- ops_counters, whose every increment is numbering plumbing rather than a change
-- anyone would want to read.
do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname like 'ops\_%' or c.relname = 'staff')
      and c.relname not in ('ops_audit_log', 'ops_counters')
    order by c.relname
  loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function ops_audit()',
      t || '_audit', t
    );
  end loop;
end $$;

-- The log is evidence, so it cannot be rewritten.
create or replace function ops_audit_block_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'ops_audit_log is append-only. The audit trail is not something that gets corrected.';
end;
$fn$;

create trigger ops_audit_log_no_update
before update on ops_audit_log
for each row execute function ops_audit_block_mutation();

create trigger ops_audit_log_no_delete
before delete on ops_audit_log
for each row execute function ops_audit_block_mutation();

alter table ops_audit_log enable row level security;

-- Anyone with an Atelier role can read it: visibility is the point of the module,
-- and a trail only some people can see is worth less.
create policy ops_audit_log_read on ops_audit_log
  for select to authenticated using (ops_current_role() is not null);

-- Deliberately no insert/update/delete policy. The trigger is SECURITY DEFINER,
-- so it writes regardless; nothing else can.

create view v_ops_audit_log
with (security_invoker = true) as
select
  a.id, a.table_name, a.row_id, a.operation, a.changed_keys,
  a.old_row, a.new_row, a.occurred_at,
  coalesce(s.full_name, a.actor_email, 'system') as actor,
  a.actor_email
from ops_audit_log a
left join staff s on s.id = a.actor_staff_id;

comment on view v_ops_audit_log is
  'The audit trail with the actor resolved to a name. Sort by occurred_at desc.';
