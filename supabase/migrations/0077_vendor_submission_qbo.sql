-- Vendor qualification → QuickBooks: once a supplier's VQ is submitted, an
-- accountant can copy it to QuickBooks as a vendor (or link it to the vendor
-- that already exists there). The submission remembers which QB vendor and
-- which Paiements supplier it became, who did it, and what QuickBooks kept.

alter table vendor_submissions
  add column qbo_vendor_id text,
  add column qbo_vendor_name text,
  add column ap_supplier_id uuid references ap_suppliers(id),
  add column qbo_pushed_at timestamptz,
  add column qbo_pushed_by uuid references staff(id),
  -- Per field: sent / kept by QuickBooks / refused, so gaps are visible.
  add column qbo_push_report jsonb;
