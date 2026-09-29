-- Drop the "existing COAs" yes/no question (removed from the form per Oaziz
-- request), add a universal "products sold" field for all vendor types.
alter table vendor_submissions drop column existing_coas;
alter table vendor_submissions add column products_sold text;
