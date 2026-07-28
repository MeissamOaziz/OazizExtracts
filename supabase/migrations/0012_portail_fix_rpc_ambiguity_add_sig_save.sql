-- Fix column/parameter ambiguity in submit_signature (rnd_ratings and
-- rnd_comments exist BOTH as function parameters AND as columns on
-- submission_participants → PL/pgSQL raises "column reference is ambiguous").
-- Qualify parameter references with the function name.
--
-- Also add optional saved-signature support so a signer can opt in to persist
-- their signature on the staff row for pre-fill on future signings.
--
-- (Full function bodies applied inline via apply_migration.)

alter table staff add column if not exists saved_signature text;
