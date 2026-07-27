-- Allow the same person to hold both a non-QA token and a QA token for the same
-- submission — happens when qa_staff_id equals any other role's staff_id on a
-- small team. Otherwise the trigger's just-in-time QA insert fails.
alter table signer_tokens drop constraint signer_tokens_submission_id_staff_id_key;
alter table signer_tokens add constraint signer_tokens_submission_staff_qa_key
  unique (submission_id, staff_id, is_qa);
