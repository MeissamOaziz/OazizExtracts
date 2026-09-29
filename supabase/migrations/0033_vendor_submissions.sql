-- New Vendor Package / Supplier Self-Audit intake, replacing the PDF-based
-- process. Submitted from a public, unauthenticated page — only the
-- server's admin (service-role) client ever touches these tables, so RLS is
-- enabled with zero policies (locks out anon/authenticated entirely, the
-- same pattern used for signer_tokens).
--
-- Approval is NOT a single QA decision: Jacob, Stephane, Jorge, Kyle and
-- Meissam must each individually click "Approved" after reviewing the
-- submission themselves. vendor_submission_approvals records one row per
-- required approver per submission, so the timestamped, per-person record
-- can be produced as proof for a Health Canada audit.

create table vendor_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),

  -- Section C: self-certification (by the vendor, on the public form)
  certified boolean not null default false,
  certified_by_name text,
  certified_by_title text,

  -- Section A: contact information
  company_name text not null,
  address text,
  city text,
  province text,
  postal_code text,
  contact_person text,
  phone text,
  email text,

  -- Page 1: sales / QA contacts, plus accounting contact (added per Oaziz request)
  sales_contact_name text,
  sales_contact_email text,
  sales_contact_phone text,
  qa_contact_name text,
  qa_contact_email text,
  qa_contact_phone text,
  accounting_contact_email text,
  accounting_contact_phone text,

  -- Business / tax numbers (added per Oaziz request)
  business_number text,
  gst_hst_number text,
  qst_number text,

  -- Banking info (added per Oaziz request)
  bank_institution_number text,
  bank_transit_number text,
  bank_account_number text,
  bank_address text,

  -- Section B: culture information
  production_type text,
  cultivation_methods text[],
  lighting_type text,
  medium_type text,
  nutrient_type text,
  cultivar_name text,
  existing_coas boolean,
  starting_material text[],
  pesticides_used text,

  -- Uploaded documents — storage paths in the `vendor-uploads` bucket
  file_cra_license_path text,
  file_health_canada_license_path text,
  file_bank_void_cheque_path text
);

alter table vendor_submissions enable row level security;

create index vendor_submissions_submitted_at_idx on vendor_submissions (submitted_at desc);

-- One row per required approver per submission, seeded at submit time.
-- approved_at stays null until that specific person clicks Approve.
create table vendor_submission_approvals (
  id uuid primary key default gen_random_uuid(),
  vendor_submission_id uuid not null references vendor_submissions(id) on delete cascade,
  staff_id uuid not null references staff(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vendor_submission_id, staff_id)
);

alter table vendor_submission_approvals enable row level security;

create index vendor_submission_approvals_submission_idx on vendor_submission_approvals (vendor_submission_id);

insert into storage.buckets (id, name, public)
values ('vendor-uploads', 'vendor-uploads', false)
on conflict (id) do nothing;
