-- Vendor qualification: Oaziz staff can fill in or correct a vendor's file and
-- upload documents for them (a vendor who sent their licenses by email instead
-- of completing the form). Those edits are logged in the file's history.
alter table vendor_submission_events
  drop constraint vendor_submission_events_decision_check,
  add constraint vendor_submission_events_decision_check
    check (decision in ('approved', 'feedback', 'rejected', 'resubmitted', 'staff_edited', 'staff_submitted'));
