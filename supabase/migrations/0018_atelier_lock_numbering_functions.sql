-- Supabase's default privileges grant EXECUTE on new public functions to anon and
-- authenticated explicitly, so the "revoke from public" in 0017 left those grants in
-- place and the numbering functions stayed reachable at /rest/v1/rpc.
--
-- These two are trigger functions. PostgreSQL checks EXECUTE when the trigger is
-- CREATEd, not when it fires, so revoking the role grants removes the REST exposure
-- without affecting order or work-order numbering. Verified after applying: a
-- signed-in user can still insert an order and get OAZ-YYYY-NNNN / WO-NNNN.
--
-- Contrast with ops_current_role() / ops_can_manage(), which ARE called from inside
-- RLS policy expressions and must keep EXECUTE — see 0016.

revoke execute on function ops_set_order_no() from anon, authenticated;
revoke execute on function ops_set_wo_no()    from anon, authenticated;
