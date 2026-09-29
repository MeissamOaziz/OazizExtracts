-- Optional QA note (Stephane) shown on the printed R&D document just above
-- the signature section. Applied to all R&D forms in the submission, same
-- pattern as the existing destruction fields.
alter table submissions add column rnd_qa_comments text;
