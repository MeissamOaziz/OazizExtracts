-- MJLB-paid suppliers are funded from RBC: every week the total going out of
-- the TD MJLB account is first deposited there from RBC in one transfer, then
-- paid out from TD over the next days. So TD-assigned payments reduce the RBC
-- balance, and TD nets to zero (transfer in = payments out).
alter table ap_bank_accounts add column funded_by uuid references ap_bank_accounts(id);

update ap_bank_accounts set funded_by = (select id from ap_bank_accounts where code = 'rbc')
where code = 'td_mjlb';

-- The approver can now also approve from the portal (logged in), not only the emailed link.
alter table ap_runs drop constraint ap_runs_approved_via_check;
alter table ap_runs add constraint ap_runs_approved_via_check check (approved_via in ('link', 'portal', 'manual'));
