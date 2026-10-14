-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-28 13:29:32 UTC as version 20260928132932
-- ("atelier_potency_from_real_coas") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Atelier — potency shaped by the three COAs Meissam sent (2026-09-28).
--
-- PPB Analytical (Toronto), Eurofins ExperNorth (Woodbridge) and Pathogenia
-- (Dorval) all print Total THC in BOTH % (w/w) and mg/g, and all state the same
-- decarboxylation formula. Checked against the real numbers: the formula
-- reproduces each lab's printed total to within rounding (worst case 0.026 mg/g,
-- on the lab that rounds its inputs to one decimal). So the printed total is what
-- we use, and the formula stays only as a fallback — which is how 0034 built it.
--
-- Two things the COAs showed that the schema could not yet express.

-- 1. Which lab. Each COA carries its own identifiers (PPB "Test Report
--    2026061047-01", Eurofins "Certificate 1788994278", Pathogenia "Numéro COA
--    260902_221828_PAR64058"), and coa_ref alone does not say whose numbering
--    scheme that is.
alter table ops_lot_potency add column if not exists lab_name text;

comment on column ops_lot_potency.lab_name is
  'Which lab issued this result. coa_ref is their certificate number, and the numbering only makes sense alongside the lab.';

-- 2. "Not detected" is a result, not a blank. Every one of these COAs reports ND
--    or BLQ for some cannabinoid, and on a CBD product or a topical that can be
--    the Total THC line itself. Blank means nobody entered it — which the
--    packaging gate refuses — whereas ND means the lab looked and found none,
--    which is a real zero on the B300.
alter table ops_lot_potency add column if not exists total_thc_is_nd boolean not null default false;

comment on column ops_lot_potency.total_thc_is_nd is
  'The lab reported Total THC as ND or BLQ. Distinct from a null, which means the result has not been entered yet.';

alter table ops_lot_potency drop column if exists effective_total_thc_mg_g;

alter table ops_lot_potency
  add column effective_total_thc_mg_g numeric(12,4)
  generated always as (
    case
      when total_thc_is_nd then 0
      else coalesce(
        total_thc_mg_g,
        total_thc_pct * 10,
        case
          when thc_pct is null and thca_pct is null then null
          else (coalesce(thc_pct, 0) + 0.877 * coalesce(thca_pct, 0)) * 10
        end
      )
    end
  ) stored;

comment on column ops_lot_potency.effective_total_thc_mg_g is
  'Total THC in mg per gram: the lab''s printed total when there is one, 0 when the lab reported ND, otherwise THC + 0.877 x THCA. This is the unit the B300 is denominated in for extracts, edibles and topicals. Null means not yet known.';

-- The movement stamp reads this column, so it inherits all of the above.
