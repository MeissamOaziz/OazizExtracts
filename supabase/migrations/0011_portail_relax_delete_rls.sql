-- Allow creators to delete their own submissions at any status (not just draft).
-- Editing / mistakes / test cleanup all need this. Cascade wipes signer_tokens,
-- signers, documents, submission_participants. Storage PDF is cleaned up by
-- the API endpoint (RLS can't do that).
drop policy if exists "submissions_delete_own_draft" on submissions;

create policy "submissions_delete_own"
  on submissions for delete
  to authenticated
  using (created_by_email = (auth.jwt() ->> 'email'));

drop policy if exists "sp_write_own_draft" on submission_participants;

create policy "sp_write_own"
  on submission_participants for all
  to authenticated
  using (
    exists (
      select 1 from submissions s
      where s.id = submission_id
        and s.created_by_email = (auth.jwt() ->> 'email')
    )
  )
  with check (
    exists (
      select 1 from submissions s
      where s.id = submission_id
        and s.created_by_email = (auth.jwt() ->> 'email')
    )
  );
