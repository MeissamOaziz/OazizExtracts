-- v_signers_public runs with owner privileges (0007) so the staff dashboard can read signer status
-- without direct access to signer_tokens. It was also readable by the `anon` role, i.e. by anyone holding
-- the public API key: 405 signer rows with staff names and email addresses, no sign-in needed.
-- The dashboard only ever queries it from a signed-in staff session (createServerClient with the user's
-- cookies), so anon never needed it. Signed-in staff keep access, as they already have to signers/staff.
--
-- Found during the 2026-10-20 Supabase security-advisor review.

revoke all on public.v_signers_public from anon;
revoke all on public.v_signers_public from public;
grant select on public.v_signers_public to authenticated, service_role;
