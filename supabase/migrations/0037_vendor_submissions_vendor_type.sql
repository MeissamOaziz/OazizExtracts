-- Business type selector: the culture-information questionnaire (Section B)
-- only applies to cannabis growers — other vendor types skip it entirely.
alter table vendor_submissions add column vendor_type text
  check (vendor_type in ('cannabis_grower', 'cannabis_extractor', 'test_laboratory', 'distributor'));
