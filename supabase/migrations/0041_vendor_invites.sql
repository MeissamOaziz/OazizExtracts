-- Tracks staff-sent vendor qualification invitations so the portal dashboard
-- can show whether a prospective vendor has started, is partway through, or
-- has completed their self-audit form — and let staff send a reminder
-- instead of wondering silently. Linked to the resulting vendor_submissions
-- row (if any) once the vendor saves their first draft or submits directly,
-- matched via a one-time invite token threaded through the public form's
-- hidden field. RLS enabled with zero policies — admin/service-role client
-- only, same pattern as every other portal table.

create table vendor_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invite_token_hash text unique,
  sent_by_staff_id uuid references staff(id),
  sent_at timestamptz not null default now(),
  vendor_submission_id uuid references vendor_submissions(id) on delete set null,
  last_reminder_sent_at timestamptz
);
alter table vendor_invites enable row level security;
create index vendor_invites_sent_at_idx on vendor_invites (sent_at desc);
create index vendor_invites_submission_idx on vendor_invites (vendor_submission_id);

-- vendor_submissions had no timestamps besides submitted_at (null until
-- actually submitted) — needed to show "last activity" on a stalled draft.
alter table vendor_submissions add column created_at timestamptz not null default now();
alter table vendor_submissions add column updated_at timestamptz not null default now();

create trigger vendor_submissions_touch_updated_at
before update on vendor_submissions
for each row execute function touch_updated_at();
