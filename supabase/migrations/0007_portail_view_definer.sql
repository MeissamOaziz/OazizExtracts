-- v_signers_public needs to read signer_tokens metadata for the dashboard, but
-- signer_tokens itself is RLS-denied to all client roles. Switch the view to
-- security_invoker=false so it runs with owner privs (bypassing RLS on the
-- joined tables). The view is safe because it never projects token_hash or
-- signature_image — only status metadata + staff names — so no privilege escape.
alter view v_signers_public set (security_invoker = false);
