-- ════════════════════════════════════════════════════════════════════════════
-- Bowson GRP — seed data (run AFTER schema.sql in the Supabase SQL Editor)
--  • operatives + catalogue reproduced 1:1 from the t-card.html prototype
--  • a small demo customer / moulds / order are added for development visibility
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Operatives ─────────────────────────────────────────────────────────────
insert into "operatives" ("name") values
  ('Mark Staniland'), ('Liam Turner'), ('Harry Cook'),
  ('Mo Smaoui'), ('Nedu Ejike'), ('Jonny Bargewell');

-- ─── Catalogue templates ────────────────────────────────────────────────────
insert into "catalogue" ("productCode","name","code","drawing","unitPrice") values
  ('10420','Twin Lane Wavy Slide (2050mm)',    'TLW-2050',      'DRW-TLW-2050',     5200),
  ('10430','Astra B2 Slide — 2 Lane (3600mm)', 'B2-2LA-3600',   'DRW-B2-2LA-3600',  4800),
  ('10431','Astra B2 Slide — 4 Lane (4200mm)', 'B2-4LA-4200',   'DRW-B2-4LA-4200',  7200),
  ('2087', 'Spiral Tube Slide (180° 2400mm)',  'STS-180D-2400H','DRW-STS-180D',     3800),
  ('2088', 'Spiral Tube Slide (540° 3500mm)',  'STS-540D-3500H','DRW-STS-540D',     6400),
  ('10512','40° Racing Slide (H2400 6000L)',   '40D-RS-H2400',  'DRW-40D-RS',       5800),
  ('3341', 'Toddler Double Bumpy MK2 (1200mm)','TDB-MK2-1200H', 'DRW-TDB-MK2',      2400),
  ('5519', 'Crawl Tube Assembly',              'CTA-2XSP',      'DRW-CTA-2XSP',     2800);

-- Hardware: every template gets the same two items
insert into "catalogue_hardware" ("catalogueId","name","qty","notes")
  select "id", 'Bolt Pack', 1, '' from "catalogue"
  union all
  select "id", 'Slide Feet', 4, '' from "catalogue";

-- Parts (keyed by productCode)
insert into "catalogue_parts" ("catalogueId","detail","hrs","drawing")
select c."id", p."detail", p."hrs", p."drawing"
from "catalogue" c
join (values
  ('10420','[TLW-2050] Lane part left',         8,  'DRW-TLW-2050-01'),
  ('10420','[TLW-2050] Lane part right',        8,  'DRW-TLW-2050-02'),
  ('10420','[TLW-2050] Side panel left',        4,  'DRW-TLW-2050-03'),
  ('10420','[TLW-2050] Side panel right',       4,  'DRW-TLW-2050-04'),
  ('10420','[TLW-2050] Run-off section',        5,  'DRW-TLW-2050-05'),
  ('10430','[B2-2LA-3600] Start lane section',      6, 'DRW-B2-2LA-01'),
  ('10430','[B2-2LA-3600] Start side panel LHS',    4, 'DRW-B2-2LA-02'),
  ('10430','[B2-2LA-3600] Start side panel RHS',    4, 'DRW-B2-2LA-03'),
  ('10430','[B2-2LA-3600] Mid lane section',        6, 'DRW-B2-2LA-04'),
  ('10430','[B2-2LA-3600] Mid side panel LHS',      4, 'DRW-B2-2LA-05'),
  ('10430','[B2-2LA-3600] Mid side panel RHS',      4, 'DRW-B2-2LA-06'),
  ('10430','[B2-2LA-3600] Run-off section',         5, 'DRW-B2-2LA-07'),
  ('10430','[B2-2LA-3600] Run-off side panel LHS',  3, 'DRW-B2-2LA-08'),
  ('10430','[B2-2LA-3600] Run-off side panel RHS',  3, 'DRW-B2-2LA-09'),
  ('10431','[B2-4LA-4200] Lane start section',      8, 'DRW-B2-4LA-01'),
  ('10431','[B2-4LA-4200] 4-lane LH side start',    5, 'DRW-B2-4LA-02'),
  ('10431','[B2-4LA-4200] 4-lane RH side start',    5, 'DRW-B2-4LA-03'),
  ('10431','[B2-4LA-4200] Mid lane section',        8, 'DRW-B2-4LA-04'),
  ('10431','[B2-4LA-4200] 4-lane LH side mid',      5, 'DRW-B2-4LA-05'),
  ('10431','[B2-4LA-4200] 4-lane RH side mid',      5, 'DRW-B2-4LA-06'),
  ('10431','[B2-4LA-4200] Long run-off section',    6, 'DRW-B2-4LA-07'),
  ('10431','[B2-4LA-4200] 4-lane LHS run-off side', 4, 'DRW-B2-4LA-08'),
  ('10431','[B2-4LA-4200] 4-lane RHS run-off side', 4, 'DRW-B2-4LA-09'),
  ('2087', '[STS-180D-2400H] Start panel',           4,  'DRW-STS-180D-01'),
  ('2087', '[STS-180D-2400H] Spiral tube section',   14, 'DRW-STS-180D-02'),
  ('2087', '[STS-180D-2400H] End scoop (supported)', 4,  'DRW-STS-180D-03'),
  ('2088', '[STS-540D-3500H] Start panel',               4,  'DRW-STS-540D-01'),
  ('2088', '[STS-540D-3500H] Spiral tube 1st section',   10, 'DRW-STS-540D-02'),
  ('2088', '[STS-540D-3500H] Spiral tube 2nd section',   10, 'DRW-STS-540D-03'),
  ('2088', '[STS-540D-3500H] Spiral tube 3rd section',   10, 'DRW-STS-540D-04'),
  ('2088', '[STS-540D-3500H] End scoop (supported)',     4,  'DRW-STS-540D-05'),
  ('10512','[40D-RS-H2400] Start side panel', 4, 'DRW-40D-RS-01'),
  ('10512','[40D-RS-H2400] Start lane',       5, 'DRW-40D-RS-02'),
  ('10512','[40D-RS-H2400] Bend lane',        6, 'DRW-40D-RS-03'),
  ('10512','[40D-RS-H2400] Bend side panel',  4, 'DRW-40D-RS-04'),
  ('10512','[40D-RS-H2400] Mid side panel',   4, 'DRW-40D-RS-05'),
  ('10512','[40D-RS-H2400] End lane',         5, 'DRW-40D-RS-06'),
  ('10512','[40D-RS-H2400] End side panel',   4, 'DRW-40D-RS-07'),
  ('3341', '[TDB-MK2-1200H] Bumpy body section', 8, 'DRW-TDB-MK2-01'),
  ('3341', '[TDB-MK2-1200H] Side panels (pair)', 5, 'DRW-TDB-MK2-02'),
  ('3341', '[TDB-MK2-1200H] Start panel',        3, 'DRW-TDB-MK2-03'),
  ('5519', '[CTA-2XSP] Start panel ×2',        4, 'DRW-CTA-2XSP-01'),
  ('5519', '[CTA-2XSP] 90° bend section',      5, 'DRW-CTA-2XSP-02'),
  ('5519', '[CTA-2XSP] Straight tube section', 5, 'DRW-CTA-2XSP-03'),
  ('5519', '[CTA-2XSP] Half tube sections',    4, 'DRW-CTA-2XSP-04')
) as p("productCode","detail","hrs","drawing") on p."productCode" = c."productCode";

-- ─── DEMO data (dev visibility — safe to delete) ─────────────────────────────
insert into "customers" ("name","contact","phone","email","region") values
  ('Aqua Splash Parks Ltd','Dave Reynolds','01482 000111','dave@aquasplash.example','Yorkshire');

insert into "moulds" ("ref","name","qty") values
  ('M-001','Mould M-001',2), ('M-002','Mould M-002',1), ('M-003','Mould M-003',1);

insert into "orders" ("orderNumber","customerId","siteName","status","isDraft","resinType","value")
  values ('DEMO-25001',
          (select "id" from "customers" where "name"='Aqua Splash Parks Ltd'),
          'Riverside Adventure Park','In Progress',false,'Standard',5440);

insert into "tickets" ("orderId","type","detail","status","pct","hrs","qty","unitPrice","netPrice")
select o."id", v."type", v."detail", v."status", v."pct", v."hrs", v."qty", v."unitPrice", v."netPrice"
from "orders" o
join (values
  ('MADE','Twin Lane Wavy Slide (2050mm)','5. Laminating',50,29,1,5200,5200),
  ('RAW', 'Stainless fixings pack',        'Ordered',      0, 0,1, 240, 240)
) as v("type","detail","status","pct","hrs","qty","unitPrice","netPrice") on true
where o."orderNumber" = 'DEMO-25001';
