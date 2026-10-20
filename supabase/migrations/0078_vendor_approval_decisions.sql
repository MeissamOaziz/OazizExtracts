-- Vendor qualification: approvers can now also put a file on hold for
-- feedback (missing or expired licence, missing document…) or reject it, with
-- a reason. Asked by Stéphane (QA) on 2026-10-19.
--
-- Each approver row carries their current decision; every decision ever made
-- is also kept in an append-only history, since the approvals are proof of
-- review for a Health Canada audit. approved_at keeps its meaning (set only
-- while the decision is "approved") so existing readers stay correct.

alter table vendor_submission_approvals
  add column decision text check (decision in ('approved', 'feedback', 'rejected')),
  add column decision_note text,
  add column decided_at timestamptz,
  add constraint vendor_submission_approvals_note_required
    check (decision is null or decision = 'approved' or length(trim(coalesce(decision_note, ''))) > 0);

update vendor_submission_approvals
   set decision = 'approved', decided_at = approved_at
 where approved_at is not null;

create table vendor_submission_events (
  id bigint generated always as identity primary key,
  vendor_submission_id uuid not null references vendor_submissions(id) on delete cascade,
  staff_id uuid references staff(id),
  at timestamptz not null default now(),
  decision text not null check (decision in ('approved', 'feedback', 'rejected')),
  note text
);
create index vendor_submission_events_sub on vendor_submission_events (vendor_submission_id, at);

-- The approvals already given are the first entries of the history.
insert into vendor_submission_events (vendor_submission_id, staff_id, at, decision)
select vendor_submission_id, staff_id, approved_at, 'approved'
  from vendor_submission_approvals where approved_at is not null;

create trigger vendor_submission_events_append_only
  before update on vendor_submission_events
  for each row execute function ps_refuse('vendor_submission_events is append-only.');

alter table vendor_submission_events enable row level security;
revoke all on vendor_submission_events from anon, authenticated;
