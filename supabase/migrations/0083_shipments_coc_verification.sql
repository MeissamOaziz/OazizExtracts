-- Shipments: the Chain of Custody is verified and signed in the portal before
-- it goes to the customer (as the R&D forms are). Until signed it is a draft;
-- QA (Stéphane, or Jacob under his own name) checks the shipment details,
-- fills the departure time, and signs. The signature is kept as a PNG data URL,
-- like the R&D signatures.

alter table sh_shipments
  add column coc_ship_date date,
  add column coc_vehicle_ok boolean not null default true,
  add column coc_vehicle_note text,
  add column coc_temperature text not null default 'N/A',
  add column coc_departure_time text,
  add column coc_signed_at timestamptz,
  add column coc_signed_by uuid references staff(id),
  add column coc_signer_name text,
  add column coc_signature text,
  add constraint sh_coc_signature_png check (coc_signature is null or coc_signature like 'data:image/png;base64,%');
