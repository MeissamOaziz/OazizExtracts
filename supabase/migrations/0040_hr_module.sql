-- Human Resources portal section: (1) a simple fill-in-the-portal -> PDF ->
-- optional email log for Attestation/Incident Report/Evaluation, (2) Oaziz's
-- own centrally-managed HR reference documents (TD1/TP-1015.3, reference-only;
-- Code of Conduct, which gets an e-signature overlay), and (3) the New
-- Employee Package onboarding e-sign flow. RLS enabled with zero policies
-- throughout — admin/service-role client only, same pattern as every other
-- portal table.

create table hr_generated_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('attestation', 'incident_report', 'evaluation')),
  generated_by_staff_id uuid references staff(id),
  generated_at timestamptz not null default now(),
  language text not null default 'fr' check (language in ('fr', 'en')),
  data jsonb not null default '{}'::jsonb,
  file_path text not null,
  sent_to text[],
  sent_at timestamptz
);
alter table hr_generated_documents enable row level security;
create index hr_generated_documents_kind_idx on hr_generated_documents (kind, generated_at desc);

create table company_hr_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique check (kind in (
    'td1_en', 'td1_fr', 'tp1015_en', 'tp1015_fr', 'code_of_conduct_en', 'code_of_conduct_fr'
  )),
  file_path text,
  requires_signature boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_staff_id uuid references staff(id)
);
alter table company_hr_documents enable row level security;

create table hr_employee_packages (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'sent' check (status in ('sent', 'awaiting_witness', 'completed')),
  language text not null check (language in ('fr', 'en')),
  new_employee_name text not null,
  new_employee_email text not null,
  sent_by_staff_id uuid references staff(id),
  sent_at timestamptz not null default now(),
  access_token_hash text unique,

  info_first_name text, info_last_name text, info_address text, info_phone text,
  info_dob date, info_sin text, info_email text,
  info_emergency_first_name text, info_emergency_last_name text, info_emergency_phone text,
  info_start_date date,
  info_signature text, info_signed_at timestamptz,

  coc_employee_signature text, coc_employee_signed_at timestamptz,
  witness_staff_id uuid references staff(id),
  coc_witness_signature text, coc_witness_signed_at timestamptz,

  info_pdf_path text,
  coc_pdf_path text
);
alter table hr_employee_packages enable row level security;
create index hr_employee_packages_access_token_idx
  on hr_employee_packages (access_token_hash) where access_token_hash is not null;
create index hr_employee_packages_status_idx on hr_employee_packages (status);

insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;
