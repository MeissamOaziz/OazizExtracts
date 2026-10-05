-- Seed ops_products from the monday.com "SKU List" board (8821011393), read
-- 2026-09-02. 64 SKUs. Only the six OCS/SQDC listings carry a GTIN today; case
-- GTIN, units per case and SKU size for non-gram formats are Meissam's to fill
-- in via /portail/atelier/parametres/produits.
--
-- product_type, sku_size_g, is_rotational and material_id are DERIVED from the
-- product name below rather than typed out 64 times. They are a starting point,
-- not gospel — the point of phase 1 is that they are now editable in one place.

insert into ops_products (monday_item_id, brand, name, status, gtin, platforms, platform_refs)
values
  ('8821370182',  'Canolio',             'Canolio - Black Cherry Punch - Syrup - 1ml',                     'active',   null,             'Médicibis, Rosebud, Flodega/Lot420',                        'Médicibis: 104757 (3g) / Rosebud: PK.EXV.0481 (3g) / Flodega: Old School'),
  ('8821379498',  'Canolio',             'Canolio - Sapphire Scout - Syrup - 1ml',                         'active',   null,             'Rosebud, Flodega/Lot420',                                   'Rosebud: PK.EXV.0381 / Flodega: Sapphire Scout Cured Rosin Vape'),
  ('8821375368',  'Canolio',             'Canolio - Three Blue Kings - Syrup - 1ml',                       'active',   null,             'Rosebud, Flodega/Lot420',                                   'Rosebud: PK.EXV.0382 / Flodega: 3 Blue Kings Syringe'),
  ('8821384038',  'Cannonfire',          'Cannonfire - Black Cherry Punch - Vape - 1ml',                   'active',   null,             'Médicibis, Rosebud, Teedy, Flodega/Lot420',                 'Médicibis: 104750 / Rosebud: PK.EXV.0385 / Teedy: Oaziz26 / Flodega: BCP Vape'),
  ('8821474197',  'Cannonfire',          'Cannonfire - Cali Biscotti - Vape - 1ml',                        'active',   null,             'Flodega/Lot420',                                            'Flodega: Cali Biscotti Vape'),
  ('8821420728',  'Cannonfire',          'Cannonfire - Flawless Victory - Vape - 1ml',                     'active',   null,             'Médicibis, Flodega/Lot420',                                 'Médicibis: 104753 / Flodega: Flawless Victory'),
  ('8821470601',  'Cannonfire',          'Cannonfire - Mandarin Cookies - Vape - 1ml',                     'active',   null,             'Médicibis, Rosebud, Flodega/Lot420',                        'Médicibis: 104752 / Rosebud: PK.EXV.0384 + PK.EXV.0476 / Flodega: Mandarin Cookies Vape'),
  ('8821391613',  'Cannonfire',          'Cannonfire - Sapphire Scout - Vape - 1ml',                       'active',   null,             'Rosebud',                                                   'Rosebud: PK.EXV.0391 (Sapphire Scout Cured Rosin Vape 1g)'),
  ('8821397651',  'Cannonfire',          'Cannonfire - Three Blue Kings - Vape - 1ml',                     'active',   null,             'Rosebud, Flodega/Lot420',                                   'Rosebud: PK.EXV.0383'),
  ('11949159601', 'Cannonfire',          'Cannonfire - Peanut Butter Breath - Vape - 1g',                  'active',   null,             'Médicibis, Rosebud, Teedy, Optimus',                        'Médicibis: 104927 / Rosebud: PK.EXV.0762 / Teedy: Oaziz27 / Optimus: item 4'),
  ('11949159682', 'Cannonfire',          'Cannonfire - Three Blue Kings - AIO Disposable - 0.5g',          'active',   null,             'Médicibis, Rosebud, Teedy',                                 'Médicibis: 105056 / Rosebud: PK.EXV.0917 / Teedy: Oaziz29'),
  ('11949159540', 'Cannonfire',          'Cannonfire - Chunk-V THCV - Vape - 1g',                          'active',   null,             'Médicibis, Teedy, Optimus',                                 'Médicibis: 104925 (Full Spectrum Chunk-V) / Teedy: Oaziz05 / Optimus: item 3'),
  ('11949164284', 'Cannonfire',          'Cannonfire - Berlin Berries - Rosin Vape Cart - 1g',             'active',   null,             'Médicibis',                                                 'Médicibis: 105007'),
  ('11949166403', 'Cannonfire',          'Cannonfire - Cap Junky - Rosin Vape Cart - 1g',                  'active',   null,             'Médicibis, Teedy',                                          'Médicibis: 104926 / Teedy: Oaziz33'),
  ('11949164468', 'Cannonfire',          'Cannonfire - Pavé - Rosin Vape Cart - 1g',                       'active',   null,             'Médicibis',                                                 'Médicibis: 104928'),
  ('11949164503', 'Cannonfire',          'Cannonfire - Mandarin Cured Rosin - Vape - 1g',                  'active',   null,             'Teedy, Rosebud',                                            'Teedy: Oaziz22 (Cannonfire Hash Rosin 510 1g) / Rosebud: PK.EXV.0383 / PK.EXV.0385'),
  ('11949169608', 'Cannonfire',          'Cannonfire - Mandarin Cookie Live Rosin - Vape - 1g',            'active',   null,             'Optimus',                                                   'Optimus: item 6 (Supply Order 363)'),
  ('11949165122', 'Cannonfire',          'Cannonfire - Mango Distillate - 510 Vape - 1g',                  'active',   null,             'Teedy',                                                     'Teedy: Oaziz35'),
  ('11949202526', 'Cannonfire',          'Cannonfire - Cliffhanger (Mango) - AIO Disposable - 0.5g',       'active',   null,             'Teedy',                                                     'Teedy: Oaziz36'),
  ('11949233272', 'Cannonfire',          'Cannonfire - Aube Bubble G - Hash Rosin - 1g',                   'active',   '628942710100',   'SQDC',                                                      'SQDC: Article 628942710100 | $439.20/case (4g unit weight)'),
  ('8821482258',  'Connoisseur Culture', 'CC - Cured Rosin Vape - Vape - 0.5g',                            'active',   '00628448270177', 'Médicibis, Rosebud, Flodega/Lot420, OCS',                   'OCS: 302543 / Médicibis: 105056 / Rosebud: PK.EXV.0917 / Flodega: 3BK Cured Rosin Vape 0.5g'),
  ('8821482340',  'Connoisseur Culture', 'CC - Hashgar - 3g',                                              'active',   null,             'Médicibis, Rosebud, Flodega/Lot420',                        'Médicibis: 103880 (Hashgar Gelato 33) / Rosebud: PK.EXV.0730 (3g) / Flodega: Hashgar Infused PreRoll 3g'),
  ('11949159998', 'Connoisseur Culture', 'CC - Mini Hashgar - Infused Pre-Roll - 1g',                      'active',   null,             'Médicibis',                                                 'Médicibis: 104006'),
  ('11949177338', 'Canolio',             'Canolio - Sapphire Scout - Syringe (Cured Rosin) - 1g',          'active',   null,             'Teedy, Rosebud',                                            'Teedy: Oaziz18 / Rosebud: PK.EXV.0382'),
  ('11949169907', 'Canolio',             'Canolio - Three Blue Kings - Syringe (Cured Rosin) - 1g',        'active',   null,             'Teedy, Rosebud',                                            'Teedy: Oaziz18 / Rosebud: PK.EXV.0382'),
  ('11949217322', 'Connoisseur Culture', 'CC - Connoisseurs Crop - Rotational Dank Outdoor - 28g',         'active',   '00628448270122', 'OCS',                                                       'OCS: 107510'),
  ('11949224273', 'Connoisseur Culture', 'CC - Connoisseur''s Craft - Rotational Smallz - 28g',            'active',   '00628448270139', 'OCS',                                                       'OCS: 107511'),
  ('11949232687', 'Connoisseur Culture', 'CC - Connoisseur''s Hash Rosin - Rotational R - 510 Cart - 1g',  'active',   '00628448270108', 'OCS',                                                       'OCS: 302516'),
  ('11949236938', 'Connoisseur Culture', 'CC - Connoisseur''s Classics - Black Afghan Hash - 2g',          'active',   '00628448270115', 'OCS',                                                       'OCS: 312519'),
  ('8821424548',  'Curado',              'Curado - Black Cherry Punch - Hash - 1.5g',                      'active',   null,             'Médicibis, Rosebud, Teedy, Kanach, Flodega/Lot420',         'Médicibis: 104806 (2g) / Rosebud: PK.EXV.0389 (1.5g) / Teedy: Oaziz31 / Kanach: 63422'),
  ('8821424644',  'Curado',              'Curado - Cali Biscotti - Hash - 1.5g',                           'active',   null,             'Teedy, Flodega/Lot420, Rosebud',                            'Teedy: Oaziz32 / Flodega: Cali Biscotti Hash'),
  ('11949169169', 'Curado',              'Curado - Cap Junky - Temple Ball - 1.5g',                        'active',   null,             'Médicibis, Teedy',                                          'Médicibis: 105060 / Teedy: Oaziz33'),
  ('11949171561', 'Curado',              'Curado - Gazzurple - Hash - 1.5g',                               'active',   null,             'Teedy, Kanach',                                             'Teedy: Oaziz20 / Kanach: Lot 73107'),
  ('8860493856',  'Curado',              'Curado - Purple Octane - Hash - 1g',                             'active',   null,             'Kanach',                                                    'Kanach: Curado Gazzurple 1.5g'),
  ('8860494078',  'Curado',              'Curado - Purple Octane - Hash - 1.5g',                           'delisted', null,             'Lyonleaf OCS',                                              null),
  ('11949160183', 'Curado',              'Curado - Peanut Butter Breath - Temple Ball - 1.5g',             'active',   null,             'Médicibis, Kanach',                                         'Médicibis: 105059 / Kanach: Curado Peanut Butter Breath 1.5g'),
  ('8821424608',  'Curado',              'Curado - Royal - Hash - 1.5g',                                   'active',   null,             'Teedy, Flodega/Lot420',                                     'Teedy: Oaziz02 (M39 Extract THC 54%) / Flodega: Royal Hash'),
  ('8821424578',  'Curado',              'Curado - Tropicanna Cookies - Hash - 1.5g',                      'active',   null,             'Rosebud, Kanach, Flodega/Lot420, Teedy',                    'Rosebud: PK.EXV.0388 (1.5g) / Kanach: 54020'),
  ('8968358418',  'Hashtisan',           'HASHTISAN - Bon Matin - Hash - 7g',                              'active',   null,             'Médicibis, Rosebud, Teedy, Flodega/Lot420',                 'Médicibis: 102978 (GWNG Hashtisan 7g) / Rosebud: PK.EXV.0392 / Teedy: Oaziz03 / Flodega: Bon Matin Hash 7g'),
  ('8968358359',  'Hashtisan',           'HASHTISAN - Old School Hash - Hash - 3g',                        'active',   null,             'Flodega/Lot420',                                            'Flodega: Old School Hash 3g'),
  ('8968358398',  'Hashtisan',           'HASHTISAN - Import Maroccan Style - Hash - 3g',                  'active',   null,             'Médicibis, Rosebud, Teedy, Kanach, Flodega/Lot420',         'Médicibis: 104757 / Rosebud: PK.EXV.0481 / Teedy: Oaziz30 / Kanach: TBD / Flodega: Old School Moroccan Hash 3g'),
  ('8968384324',  'Hashtisan',           'HASHTISAN - Mango Infused - Hash - 2g',                          'active',   null,             'Flodega/Lot420',                                            'Flodega: Mango Hash 2g'),
  ('8968388260',  'Hashtisan',           'HASHTISAN - Pineapple Twist - Hash - 1g',                        'active',   null,             'Médicibis, Flodega/Lot420',                                 'Médicibis: 104756 (Gem Pineapple Diamond Infused 1g) / Flodega: Pineapple Twist Hash 1g'),
  ('8968711639',  'Hashtisan',           'HASHTISAN - Hashgar - 3g',                                       'active',   null,             'Rosebud, Médicibis, Flodega/Lot420',                        'Rosebud: PK.EXV.0730 (3g) / Médicibis: 103880 (Hashgar Gelato 33)'),
  ('11949164786', 'Hashtisan',           'HASHTISAN - Mini-Hashgar - Infused Pre-Roll - 1.5g',             'active',   null,             'Rosebud, Optimus',                                          'Rosebud: PK.EXV.0731 (1.5g) / Optimus: item 5 (1.5g)'),
  ('9109858564',  'Hashtisan',           'HASHTISAN - Sungrow - 4g',                                       'new',      null,             'TBD - New SKU',                                             null),
  ('8860496693',  'HAZO',                'HAZO - CBD BB Muffins - VAPE - 1g',                              'active',   '00628448270016', 'Médicibis, Rosebud, Teedy, Optimus, Flodega/Lot420, OCS',   'OCS: 302542 / Rosebud: PK.EXV.0458 / Teedy: Oaziz23 / Optimus: item 1 / Flodega: BB Muffins CBD Vape 1g'),
  ('8968393497',  'HAZO',                'HAZO - BB Muffins - Flower - 14g',                               'delisted', null,             'Flodega/Lot420, Teedy, Optimus',                            'Flodega: Blueberry Muffins Flower 14g / Teedy: Oaziz10 (3×0.5g pre-rolls)'),
  ('8860498559',  'HAZO',                'HAZO - BB Muffins - Flower - 15g',                               'delisted', null,             'Médicibis, Rosebud, Teedy, Optimus, Flodega/Lot420',        'Médicibis: 105075 (Cali B 7g) / Rosebud: PK.DC.DF (Smalls 28g) / Teedy: Oaziz19 (7g)'),
  ('8860499383',  'HAZO',                'HAZO - BB Muffins - Pre Rolls - 1.5g',                           'active',   null,             'Teedy, Flodega/Lot420',                                     'Teedy: Oaziz10 (3×0.5g) / Flodega: Blueberry Muffins Pre-Rolls 3×0.5g'),
  ('8968397165',  'HAZO',                'HAZO - Cali Biscotti - Flower - 14g',                            'delisted', null,             'Flodega/Lot420',                                            'Flodega: Cali Biscotti Flower 14g'),
  ('8968398542',  'HAZO',                'HAZO - Frosted Cookies - Flower - 14g',                          'delisted', null,             'Flodega/Lot420',                                            'Flodega: Frosted Cookies Flower 14g'),
  ('8968401178',  'HAZO',                'HAZO - Freezeland - Flower - 14g',                               'delisted', null,             'Flodega/Lot420',                                            'Flodega: Freezeland Flower 14g'),
  ('11949159852', 'HAZO',                'HAZO - Cali B - Flower - 7g',                                    'active',   null,             'Médicibis',                                                 'Médicibis: 105075'),
  ('11949169269', 'HAZO',                'HAZO - Cap Junky - Smalls - 28g',                                'active',   null,             'Rosebud',                                                   'Rosebud: PK.DC.DF.0922'),
  ('11949169468', 'HAZO',                'HAZO - Red Velvet Ice Cream - Smalls - 28g',                     'active',   null,             'Rosebud',                                                   'Rosebud: PK.DC.DF.0929'),
  ('11949159914', 'HAZO',                'HAZO - Rainbow Pavé - Smalls - 28g',                             'active',   null,             'Rosebud',                                                   'Rosebud: PK.DC.DF.0930'),
  ('11949160161', 'HAZO',                'HAZO - Mango K - Smalls - 28g',                                  'active',   null,             'Rosebud',                                                   'Rosebud: PK.DC.DF.0931'),
  ('11949169529', 'HAZO',                'HAZO - Gas Cream Cake - Smalls - 28g',                           'active',   null,             'Rosebud',                                                   'Rosebud: PK.DC.DF.1001'),
  ('11949166596', 'HAZO',                'HAZO - Gastro Pop - Smalls - 28g',                               'active',   null,             'Rosebud',                                                   'Rosebud: PK.DC.DF.1002'),
  ('11949164989', 'HAZO',                'HAZO - Gary Payton - Flower - 14g',                              'delisted', null,             'Teedy, Optimus',                                            'Teedy: Oaziz38 (14g) / Optimus: item 7 (14g)'),
  ('8967986638',  'XAMAN',               'XAMAN - 1000mg CBD Relief Cream - Topical - 50g',                'delisted', null,             'Flodega/Lot420 (delisted)',                                 'Flodega: Xaman 1000 CBD Relief Cream'),
  ('8967986592',  'XAMAN',               'XAMAN - 2000mg CBD Relief Cream - Topical - 50g',                'active',   null,             'Kanach, Rosebud, Flodega/Lot420',                           'Kanach: Lot 63494 / Rosebud: PK.TOP.0105 / Flodega: Xaman 2000 CBD Relief Cream'),
  ('8967986618',  'XAMAN',               'XAMAN - High CBD Lotion - Topical - 220g',                       'active',   null,             'Rosebud (Active)',                                          'Rosebud: PK.TOP (220g High CBD Lotion)')
on conflict do nothing;

-- Derive SKU size from a trailing "… - 28g" / "… - 1.5g". Volume formats such as
-- "1ml" correctly yield null — they are not a gram weight and shouldn't pretend to be.
update ops_products
set sku_size_g = (substring(name from '([0-9]+(?:\.[0-9]+)?)\s*[gG]$'))::numeric
where sku_size_g is null
  and name ~ '([0-9]+(?:\.[0-9]+)?)\s*[gG]$';

-- Product type = the segment before the size, but only for names that actually
-- carry one (4+ segments). A 3-segment name like "CC - Hashgar - 3g" has no type
-- to extract, so it is left null rather than filled with the strain name.
update ops_products
set product_type = (string_to_array(name, ' - '))[array_length(string_to_array(name, ' - '), 1) - 1]
where product_type is null
  and array_length(string_to_array(name, ' - '), 1) >= 4;

update ops_products set is_rotational = true where name ilike '%rotational%';

-- First-pass material mapping. Rosin is checked before hash so that
-- "Hash Rosin" resolves to rosin. Topicals stay unmapped on purpose.
update ops_products p set material_id = m.id
from ops_materials m
where p.material_id is null and m.code = 'ROSIN'
  and (p.name ilike '%rosin%' or p.name ilike '%syrup%' or p.name ilike '%syringe%');

update ops_products p set material_id = m.id
from ops_materials m
where p.material_id is null and m.code = 'HASH'
  and (p.name ilike '%hash%' or p.name ilike '%temple ball%');

update ops_products p set material_id = m.id
from ops_materials m
where p.material_id is null and m.code = 'FLOWER'
  and (p.name ilike '%flower%' or p.name ilike '%smalls%' or p.name ilike '%pre-roll%' or p.name ilike '%pre roll%');
