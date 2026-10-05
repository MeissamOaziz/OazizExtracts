-- 0028 added p_owner_customer_id, which changes the signature — so `create or
-- replace` produced a SECOND overload rather than replacing the original. Two
-- candidates make every call ambiguous, over RPC as well as from SQL. Drop the
-- 15-argument version; the 16-argument one defaults the new parameter to null.
drop function if exists ops_receive_lot(
  uuid, numeric, text, ops_lot_origin, text, date, text,
  numeric, numeric, ops_potency_source, text, date, text, text, text
);
