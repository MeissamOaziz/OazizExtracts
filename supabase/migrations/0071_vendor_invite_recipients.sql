-- Vendor qualification — one invite can go to several people, who all share one
-- link and fill in one form together.
--
-- Meissam, 2026-10-08: "we need to be able to send it to multiple emails ... so
-- they all get the same link and can update the form."
--
-- recipients: everyone the invite went to. `email` stays as the first of them,
-- so anything still reading the single address keeps working.
--
-- extra_token_hashes: a reminder mints a fresh link, because only a hash of the
-- original was ever stored. Until now the reminder replaced the old hash, which
-- for one person was harmless but for a group would break the link in everyone's
-- earlier email. Superseded hashes now stay valid here instead.

alter table vendor_invites
  add column if not exists recipients text[] not null default '{}',
  add column if not exists extra_token_hashes text[] not null default '{}';

update vendor_invites
   set recipients = array[lower(trim(email))]
 where cardinality(recipients) = 0 and email is not null;

create index if not exists vendor_invites_extra_token_hashes_idx
  on vendor_invites using gin (extra_token_hashes);

comment on column vendor_invites.recipients is
  'Every address this invite was sent to. They share one link and one form.';
comment on column vendor_invites.extra_token_hashes is
  'Hashes of earlier links for this invite that must keep working after a reminder minted a new one.';
