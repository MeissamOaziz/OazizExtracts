-- Expiry date for each vendor-uploaded license (CRA, Health Canada), so we
-- can proactively ask vendors to send us a renewed copy instead of
-- discovering an expired license during an audit. reminder_sent_at mirrors
-- the company_licenses pattern (cleared whenever the vendor tells us a new
-- expiry date, so a renewed license gets its own future reminder cycle).

alter table vendor_submissions
  add column file_cra_license_expiry date,
  add column file_health_canada_license_expiry date,
  add column file_cra_license_reminder_sent_at timestamptz,
  add column file_health_canada_license_reminder_sent_at timestamptz;
