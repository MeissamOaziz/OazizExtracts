-- Participant-provided evaluation for their own R&D form: 1-5 ratings for
-- odeur/goût/texture/globale + free-text comments. Filled at signing time.
alter table submission_participants
  add column rnd_ratings jsonb,
  add column rnd_comments text;

-- Update submit_signature to also (optionally) persist ratings + comments on
-- the participant's row. Only writes when the signer is the participant AND
-- rnd_ratings is provided; other signer types ignore these params.
-- Also expands get_signer_context to include the participant's current
-- rnd_ratings/rnd_comments so the form pre-fills on reload.
--
-- The old 4-arg submit_signature overload is dropped to avoid PostgREST
-- ambiguity between the two signatures.
--
-- (Full function bodies applied inline via apply_migration; see migration 0010
-- in the Supabase migration history for the exact text.)

alter table submission_participants
  add column if not exists rnd_ratings jsonb,
  add column if not exists rnd_comments text;
