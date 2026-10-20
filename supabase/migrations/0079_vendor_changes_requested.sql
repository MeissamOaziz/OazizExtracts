-- Vendor qualification: when an approver puts a file on hold or rejects it,
-- the supplier can be emailed the reason with a private link to correct and
-- resubmit their VQ. The history records who was emailed, and the
-- resubmission itself (after which every approver reviews again).

alter table vendor_submission_events
  drop constraint vendor_submission_events_decision_check,
  add constraint vendor_submission_events_decision_check
    check (decision in ('approved', 'feedback', 'rejected', 'resubmitted')),
  add column supplier_notified_to text[];
