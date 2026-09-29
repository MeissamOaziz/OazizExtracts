-- Oaziz's own CRA and Health Canada licenses, managed centrally so they can
-- be quickly downloaded, replaced, tracked for expiry, and sent to vendors
-- or other companies on request. RLS enabled with zero policies — only the
-- admin (service-role) client touches this table, same pattern as
-- signer_tokens / vendor_submissions.
create table company_licenses (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique check (kind in ('cra', 'health_canada')),
  file_path text,
  expiry_date date,
  reminder_recipients text[] not null default '{}',
  reminder_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_staff_id uuid references staff(id)
);

alter table company_licenses enable row level security;

insert into storage.buckets (id, name, public)
values ('company-licenses', 'company-licenses', false)
on conflict (id) do nothing;
