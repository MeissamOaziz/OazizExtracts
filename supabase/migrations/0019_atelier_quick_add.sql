-- Quick-add from the order form.
--
-- Phase 1 restricted all reference-data writes to admin + production_manager
-- (ops_can_manage()). That breaks the workflow Meissam asked for on 2026-09-08:
-- whoever is entering a PO must be able to add a missing SKU or a new customer
-- without leaving the form — and that person is usually sales.
--
-- So the permission is split by verb rather than by table:
--   INSERT  → anyone with an Atelier role (intake must never be blocked)
--   UPDATE  → managers only, via the existing _manage policy
--   DELETE  → managers only, via the existing _manage policy
--
-- Permissive policies are OR'd, so adding an INSERT policy widens creation only;
-- the manage policy remains the sole route to editing and deleting.

create policy ops_customers_insert_any_role on ops_customers
  for insert to authenticated
  with check (ops_current_role() is not null);

create policy ops_products_insert_any_role on ops_products
  for insert to authenticated
  with check (ops_current_role() is not null);
