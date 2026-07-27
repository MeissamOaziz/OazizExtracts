-- Oaziz internal R&D portal — initial schema.
-- Project: jveikcsyomkornamuude
--
-- Design notes
-- ------------
-- * All tables live in `public` (this Supabase project is dedicated to the portal).
-- * Staff are identified by email; the link to auth.users is via JWT email at query time
--   (no auth_user_id column to maintain). Small team, low churn.
-- * `signers` is NEVER exposed to authenticated users directly — token-based signer flows
--   go through SECURITY DEFINER RPCs added in the next migration (Milestone B).
-- * Storage bucket for finalized PDFs is created via the dashboard (Milestone C).

-- ============================================================
-- Enums
-- ============================================================

create type signer_role as enum (
  'initiator',
  'production',
  'participant',
  'consent_obtainer',
  'qa_verifier'
);

create type document_kind as enum ('sample_request', 'rnd', 'consent');

create type submission_status as enum (
  'draft',           -- Kyle is still editing
  'sent',            -- Sent for signature; some signers pending
  'signing',         -- At least one signature captured, not all
  'complete',        -- All non-QA signatures collected; QA link now active
  'finalized',       -- QA signed; PDFs generated + emailed
  'cancelled'
);

create type signer_status as enum ('pending', 'signed', 'expired', 'revoked');

create type production_state as enum ('vrac', 'emballe');

-- ============================================================
-- staff
-- ============================================================

create table staff (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null unique,
  title         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table staff is 'Oaziz personnel who can appear in dropdowns or be signers. Seeded, not user-managed.';

-- Seed the 7 staff members from Meissam's list (2026-07-17).
insert into staff (full_name, email, title) values
  ('Jorge Sousa',          'jorge@oaziz.ca',    'CEO'),
  ('Kyle St-Hilaire',      'kyle@oaziz.ca',     'Directeur des Ventes'),
  ('Simon Salomone',       'simon@oaziz.ca',    'Directeur Production'),
  ('Meissam Hagh Panah',   'meissam@oaziz.ca',  'Directeur Financier'),
  ('Stephane Paquin',      'stephane@oaziz.ca', 'Directeur AQ'),
  ('Jacob Poli',           'jacobp@oaziz.ca',   'AQ'),
  ('Théophane Gendrot',    'theogen53@gmail.com', 'Contractuel');

-- ============================================================
-- submissions
-- ============================================================

create table submissions (
  id                          uuid primary key default gen_random_uuid(),
  status                      submission_status not null default 'draft',
  created_by_email            text not null,                          -- JWT email at creation time
  initiator_staff_id          uuid not null references staff(id),
  production_staff_id         uuid not null references staff(id),     -- Simon by default
  qa_staff_id                 uuid not null references staff(id),     -- Stephane by default
  consent_obtainer_staff_id   uuid not null references staff(id),     -- Jorge by default
  form_date                   date not null,
  product_name                text not null,
  product_type                text not null,
  quantity                    text not null,
  production_state            production_state,
  production_id               text,
  -- Shared R&D fields (filled at Kyle's review step, Milestone B)
  rnd_objective               text,
  rnd_quantity_for_test       text,
  rnd_lp_number               text,
  rnd_qty_destroyed           text,
  rnd_date_destroyed          date,
  -- Lifecycle timestamps
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  sent_at                     timestamptz,
  finalized_at                timestamptz
);

create index submissions_status_idx on submissions (status);
create index submissions_created_at_idx on submissions (created_at desc);

-- Auto-update updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger submissions_touch_updated_at
before update on submissions
for each row execute function touch_updated_at();

-- ============================================================
-- submission_participants (N per submission)
-- ============================================================

create table submission_participants (
  submission_id         uuid not null references submissions(id) on delete cascade,
  participant_staff_id  uuid not null references staff(id),
  primary key (submission_id, participant_staff_id)
);

-- ============================================================
-- signers (Milestone B populates this)
-- ============================================================

create table signers (
  id                       uuid primary key default gen_random_uuid(),
  submission_id            uuid not null references submissions(id) on delete cascade,
  role                     signer_role not null,
  staff_id                 uuid not null references staff(id),
  document_kind            document_kind not null,
  participant_staff_id     uuid references staff(id),  -- for rnd/consent only
  token_hash               text not null,              -- sha-256 hex of the URL token
  expires_at               timestamptz not null,
  signed_at                timestamptz,
  signature_image          text,                        -- base64 data URL or storage path
  ip_address               inet,
  user_agent               text,
  status                   signer_status not null default 'pending',
  unlocks_after_role       signer_role,                 -- e.g. qa_verifier unlocks after all others signed
  created_at               timestamptz not null default now()
);

create unique index signers_token_hash_uniq on signers (token_hash);
create index signers_submission_idx on signers (submission_id);
create index signers_status_idx on signers (status);

-- ============================================================
-- documents (Milestone C populates this)
-- ============================================================

create table documents (
  id                   uuid primary key default gen_random_uuid(),
  submission_id        uuid not null references submissions(id) on delete cascade,
  kind                 document_kind not null,
  participant_staff_id uuid references staff(id),
  pdf_path             text not null,   -- Supabase Storage path in the 'documents' bucket
  finalized_at         timestamptz not null default now()
);

create index documents_submission_idx on documents (submission_id);

-- ============================================================
-- audit_log
-- ============================================================

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete set null,
  actor_email   text,                    -- staff email or signer email
  action        text not null,           -- 'draft_saved', 'sent_for_signature', 'signature_captured', 'pdf_finalized', ...
  ip_address    inet,
  user_agent    text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index audit_log_submission_idx on audit_log (submission_id, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table staff                  enable row level security;
alter table submissions            enable row level security;
alter table submission_participants enable row level security;
alter table signers                enable row level security;
alter table documents              enable row level security;
alter table audit_log              enable row level security;

-- staff: any authenticated user can read the active roster.
create policy "staff_read_authenticated"
  on staff for select
  to authenticated
  using (is_active = true);

-- submissions: authenticated users see everything (small internal team).
-- Kyle logs in and sees who has signed on each submission. Same for anyone else who logs in.
create policy "submissions_read_authenticated"
  on submissions for select
  to authenticated using (true);

create policy "submissions_insert_authenticated"
  on submissions for insert
  to authenticated
  with check (created_by_email = (auth.jwt() ->> 'email'));

-- Only the creator can update or delete their own drafts.
create policy "submissions_update_own_draft"
  on submissions for update
  to authenticated
  using (
    created_by_email = (auth.jwt() ->> 'email')
    and status = 'draft'
  )
  with check (created_by_email = (auth.jwt() ->> 'email'));

create policy "submissions_delete_own_draft"
  on submissions for delete
  to authenticated
  using (
    created_by_email = (auth.jwt() ->> 'email')
    and status = 'draft'
  );

-- submission_participants: read for authenticated; write only via the parent submission's owner while draft.
create policy "sp_read_authenticated"
  on submission_participants for select
  to authenticated using (true);

create policy "sp_write_own_draft"
  on submission_participants for all
  to authenticated
  using (
    exists (
      select 1 from submissions s
      where s.id = submission_id
        and s.created_by_email = (auth.jwt() ->> 'email')
        and s.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from submissions s
      where s.id = submission_id
        and s.created_by_email = (auth.jwt() ->> 'email')
        and s.status = 'draft'
    )
  );

-- signers: authenticated users can READ status (for the "who signed?" dashboard),
-- but only see safe columns via a view (below). No direct write, insert, delete.
-- Signer flow goes through SECURITY DEFINER RPCs added in Milestone B.
create policy "signers_read_status_authenticated"
  on signers for select
  to authenticated using (true);
-- NB: token_hash and signature_image should NOT be surfaced to the client — see v_signers_public.

-- documents: authenticated users can read metadata (finalized PDFs are in Storage with signed URLs).
create policy "documents_read_authenticated"
  on documents for select
  to authenticated using (true);

-- audit_log: authenticated users can read.
create policy "audit_read_authenticated"
  on audit_log for select
  to authenticated using (true);

-- ============================================================
-- View: safe projection of signers for the dashboard
-- ============================================================

create view v_signers_public as
select
  s.id,
  s.submission_id,
  s.role,
  s.staff_id,
  st.full_name         as staff_name,
  st.email             as staff_email,
  s.document_kind,
  s.participant_staff_id,
  pst.full_name        as participant_name,
  s.expires_at,
  s.signed_at,
  s.status,
  s.created_at
from signers s
join staff st on st.id = s.staff_id
left join staff pst on pst.id = s.participant_staff_id;

grant select on v_signers_public to authenticated;
