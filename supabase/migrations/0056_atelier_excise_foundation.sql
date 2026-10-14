-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 13:28:02 UTC as version 20260928132802
-- ("atelier_excise_foundation") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — the foundation the B300 stands on.
--
-- Three things the return needs that nothing in Atelier could express yet:
--   1. Which CRA class each material belongs to. ops_material_category is our own
--      taxonomy (raw / intermediate / finished / additive); the B300 has its own,
--      and every figure on the return is bucketed by it.
--   2. Total THC. Extracts, edibles and topicals are reported in MILLIGRAMS OF
--      TOTAL THC, not grams, so potency stops being a nice-to-have and becomes the
--      unit of account. Meissam, 2026-09-28: "All COAs include both individual
--      values and total THC and CBD, both in % and mg/g."
--   3. Where material came from and where it went, because "received in Canada" /
--      "imported" and "sold in Canada" / "exported" are separate reported lines.
--      Oaziz exports, so that line is real.

-- ============================================================
-- 1. CRA excise classes
-- ============================================================

create type ops_excise_class as enum (
  'flowering',          -- Dried/fresh cannabis, flowering material      (kg)
  'non_flowering',      -- Dried/fresh cannabis, non-flowering material  (kg)
  'whole_plant',        -- Whole cannabis plant                          (plants)
  'viable_seed',        -- Viable seed                                   (seeds)
  'vegetative_plant',   -- Vegetative cannabis plant                     (plants)
  'pure_intermediate',  -- Pure intermediates                            (kg)
  'finished_extract',   -- Finished cannabis extracts                    (mg total THC)
  'finished_edible',    -- Finished edible cannabis                      (mg total THC)
  'finished_topical',   -- Finished cannabis topicals                    (mg total THC)
  'not_cannabis'        -- Packaging, terpenes: never on the return
);

comment on type ops_excise_class is
  'The B300 taxonomy. Distinct from ops_material_category, which is how Oaziz thinks about material internally.';

alter table ops_materials add column if not exists excise_class ops_excise_class;

-- Proposed mapping, seeded so nothing starts blank. It is editable in settings and
-- MUST be confirmed by QA: if a material is in the wrong class, every figure that
-- class feeds is wrong.
update ops_materials set excise_class = v.cls::ops_excise_class
from (values
  ('FLOWER',     'flowering'),
  ('TRIM',       'non_flowering'),
  ('KIEF',       'pure_intermediate'),
  ('TRICHOMES',  'pure_intermediate'),
  ('HASH',       'finished_extract'),
  ('IWE_HASH',   'finished_extract'),
  ('ROSIN',      'finished_extract'),
  ('DISTILLATE', 'finished_extract'),
  ('ISOLATE',    'finished_extract'),
  ('TERPENES',   'not_cannabis'),
  ('PACKAGING',  'not_cannabis')
) as v(code, cls)
where ops_materials.code = v.code and ops_materials.excise_class is null;

-- Anything added later without a class defaults to non-reportable rather than
-- silently landing in a reported bucket.
alter table ops_materials alter column excise_class set default 'not_cannabis';
update ops_materials set excise_class = 'not_cannabis' where excise_class is null;
alter table ops_materials alter column excise_class set not null;

comment on column ops_materials.excise_class is
  'Which line of the B300 this material reports on. Whether it is measured in kg or in mg of total THC follows from this.';

-- ============================================================
-- 2. Potency, as the COAs actually report it
-- ============================================================

alter table ops_lot_potency add column if not exists thca_pct         numeric(6,3);
alter table ops_lot_potency add column if not exists cbda_pct         numeric(6,3);
alter table ops_lot_potency add column if not exists total_thc_pct    numeric(6,3);
alter table ops_lot_potency add column if not exists total_cbd_pct    numeric(6,3);
alter table ops_lot_potency add column if not exists total_thc_mg_g   numeric(10,3);
alter table ops_lot_potency add column if not exists total_cbd_mg_g   numeric(10,3);

-- One number the rest of the system can rely on, whichever way the lab reported it:
-- the lab's own total when it gave one, else its total %, else the decarboxylation
-- formula CRA duty is based on. 1% = 10 mg/g.
alter table ops_lot_potency
  add column if not exists effective_total_thc_mg_g numeric(12,4)
  generated always as (
    coalesce(
      total_thc_mg_g,
      total_thc_pct * 10,
      (coalesce(thc_pct, 0) + 0.877 * coalesce(thca_pct, 0)) * 10
    )
  ) stored;

comment on column ops_lot_potency.effective_total_thc_mg_g is
  'Total THC in mg per gram, preferring what the lab printed and falling back to THC + 0.877 x THCA. This is the number the B300 is denominated in for extracts, edibles and topicals.';

-- ============================================================
-- 3. Potency frozen onto every movement
-- ============================================================

-- A movement is append-only, so stamping the potency as it stood when the material
-- moved means a retest next quarter can never rewrite a month already filed.
alter table ops_lot_movements add column if not exists total_thc_mg_g numeric(12,4);

comment on column ops_lot_movements.total_thc_mg_g is
  'Total THC per gram as at this movement. Stamped by trigger, never edited: a later retest must not change what was already reported.';

create or replace function ops_stamp_movement_potency()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.total_thc_mg_g is null then
    select p.effective_total_thc_mg_g into new.total_thc_mg_g
    from ops_lot_potency p
    where p.lot_id = new.lot_id
    order by p.recorded_at desc
    limit 1;
  end if;
  return new;
end;
$fn$;

revoke execute on function ops_stamp_movement_potency() from public, anon, authenticated;

-- Before the append-only guard, so it applies to every writer there will ever be
-- rather than having to be remembered in each function.
drop trigger if exists ops_movements_stamp_potency on ops_lot_movements;
create trigger ops_movements_stamp_potency
before insert on ops_lot_movements
for each row execute function ops_stamp_movement_potency();

-- ============================================================
-- 4. Where it came from, where it went
-- ============================================================

alter table ops_lots add column if not exists received_country text not null default 'CA';
comment on column ops_lots.received_country is
  'ISO country the material was received from. Anything other than CA reports on "quantity imported into Canada" rather than "received in Canada".';

alter table ops_orders add column if not exists destination_country text not null default 'CA';
comment on column ops_orders.destination_country is
  'ISO country the goods ship to. Anything other than CA reports on "quantity exported outside Canada". Oaziz exports, so this line is real.';

create index if not exists ops_lots_received_country_idx on ops_lots (received_country);
create index if not exists ops_orders_destination_country_idx on ops_orders (destination_country);
