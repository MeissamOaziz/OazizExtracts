-- Shipping work orders: "Packaging LOT #" was the same thing as the packaging
-- run ID and was never filled in; the column goes. Applied after the code that
-- stopped writing it was live.
alter table ps_swo_lines drop column packaging_lot_no;
