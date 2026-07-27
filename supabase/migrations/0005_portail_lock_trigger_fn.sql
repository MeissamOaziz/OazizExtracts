-- The trigger function shouldn't be callable as an RPC; triggers run with
-- their definer's privileges regardless of who can execute it directly.
revoke all on function on_signer_token_completed() from public, anon, authenticated;
