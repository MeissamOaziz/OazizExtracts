-- Vendor qualification — every contact gets a name, an email and a phone with
-- its extension, in separate fields.
--
-- Meissam, 2026-10-08, looking at the PBG BioPharma submission: the contacts
-- read as one dash-joined line ("Ramandeep Singh — ramandeep@… — 7809809801 ext
-- 108"), the accounting contact had no name at all, and the extension only
-- existed because the vendor typed it into the phone field. Each piece now has
-- its own column so the review page can lay it out the way it lays out the
-- company address.

alter table vendor_submissions add column if not exists phone_ext                    text;
alter table vendor_submissions add column if not exists sales_contact_phone_ext      text;
alter table vendor_submissions add column if not exists qa_contact_phone_ext         text;
alter table vendor_submissions add column if not exists accounting_contact_name      text;
alter table vendor_submissions add column if not exists accounting_contact_phone_ext text;

comment on column vendor_submissions.accounting_contact_name is
  'Optional: some vendors give a shared accounting mailbox rather than a person.';

-- Split an extension the vendor typed into the phone field ("7809809801 ext 108",
-- "x108", "poste 108") into its own column, for submissions made before this
-- change. Only rows with an unambiguous marker are touched.
do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('phone',                    'phone_ext'),
      ('sales_contact_phone',      'sales_contact_phone_ext'),
      ('qa_contact_phone',         'qa_contact_phone_ext'),
      ('accounting_contact_phone', 'accounting_contact_phone_ext')
    ) as v(phone_col, ext_col)
  loop
    execute format($q$
      update vendor_submissions
         set %2$I = substring(%1$I from '(?i)(?:ext\.?|extension|poste|x)\s*#?\s*(\d{1,6})\s*$'),
             %1$I = trim(regexp_replace(%1$I, '(?i)[\s,]*(?:ext\.?|extension|poste|x)\s*#?\s*\d{1,6}\s*$', ''))
       where %2$I is null
         and %1$I ~* '(?:ext\.?|extension|poste|x)\s*#?\s*\d{1,6}\s*$'
    $q$, pair.phone_col, pair.ext_col);
  end loop;
end $$;
