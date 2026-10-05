-- Two commercial arrangements where the material is not simply ours:
--
--   customer_supplied — tolling. The customer's material; we extract and give the
--                       output back. It is on our floor but it was never bought.
--   supplier_special  — the supplier is paid the agreed trim cost only once the
--                       output sells, and the profit on that sale is split.
--
-- Added in their own migration because a new enum value cannot be used in the
-- same transaction that creates it.
alter type ops_lot_origin add value if not exists 'customer_supplied';
alter type ops_lot_origin add value if not exists 'supplier_special';
