-- Authenticated users can append audit entries only for their own actions.
-- Server routes that log on behalf of anonymous signers (Milestone B) will use
-- the service-role admin client and bypass this policy.
create policy "audit_insert_own"
  on audit_log for insert
  to authenticated
  with check (actor_email = (auth.jwt() ->> 'email'));
