-- Lets a vendor save an in-progress submission and resume it later via a
-- private link (no login), and adds a separate shipping address. Draft rows
-- are never seeded with approvals/emails — only a status='submitted' row is.

alter table vendor_submissions
  add column status text not null default 'draft' check (status in ('draft', 'submitted')),
  add column resume_token_hash text unique,
  add column shipping_same_as_billing boolean not null default true,
  add column shipping_address text,
  add column shipping_city text,
  add column shipping_province text,
  add column shipping_postal_code text;

-- submitted_at should be null until the vendor actually submits, not set at
-- draft-creation time.
alter table vendor_submissions alter column submitted_at drop not null;
alter table vendor_submissions alter column submitted_at drop default;

create index vendor_submissions_resume_token_idx
  on vendor_submissions (resume_token_hash)
  where resume_token_hash is not null;

create index vendor_submissions_status_idx on vendor_submissions (status);
