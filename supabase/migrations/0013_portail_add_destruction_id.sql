-- New QA-provided field for the R&D verification block: the destruction batch
-- ID that Stephane records alongside the existing qty_destroyed + date_destroyed
-- columns when he processes destruction.
alter table submissions add column if not exists rnd_destruction_id text;

-- submit_signature updated to return is_qa in its success payload — the API
-- endpoint uses it to authorize destruction-field writes for the QA signer.
-- (Full function body applied via apply_migration.)
