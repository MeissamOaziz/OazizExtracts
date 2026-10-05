-- Supplier matching for dropped invoices: other names the supplier appears
-- under on its invoices (learned when someone corrects the match), and its tax
-- numbers (the most reliable match key).
alter table ap_suppliers
  add column aliases text[] not null default '{}',
  add column gst_number text,
  add column qst_number text;

update ap_suppliers set aliases = array['Canadian Cannabis Exchange Ltd.', 'Canadian Cannabis Exchange'] where name = 'CCX';
