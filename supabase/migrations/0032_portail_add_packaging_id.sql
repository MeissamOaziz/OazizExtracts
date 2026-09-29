-- Packaging ID number: recorded next to the lot number (production_id) when
-- the unit(s) being tested is/are packaged, so QA can cross-check both
-- identifiers before signing off on an R&D submission.
alter table submissions add column packaging_id text;
