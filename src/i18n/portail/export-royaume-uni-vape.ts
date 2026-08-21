export const frExportRoyaumeUniVape = {
  // Page chrome
  backLink: '← Retour aux calculatrices',
  pageTitle: 'Export Royaume-Uni — Vape',
  pageIntro:
    "Modélise le parcours Oaziz Extracts → AgMedica (Canada) → RX Distributor (UK) → Grow Group UK → Détail UK, " +
    "du trim brut jusqu'au coût par cartouche vape selon le palier de volume de tolling, avec analyse de marge.",

  // Currencies
  currenciesTitle: 'Devises',
  gbpToCadLabel: 'Taux de conversion GBP → CAD',
  cadToGbpLabel: 'Taux CAD → GBP (dérivé)',

  // Starting material
  startingMaterialTitle: 'Matière de départ',
  totalInputLabel: 'Grammes de matière première (trim/têtes)',
  costPerGLabel: 'Coût par gramme (CA$/g)',

  // Lab tests
  labTestsTitle: 'Tests de laboratoire (COA)',
  numLotsLabel: 'Nombre de lots/souches',
  labTestsHint:
    'Coût par COA (fixe, non modifiable) : Test A 1 750,00 $ + Test B 3 675,00 $ = 5 425,00 $ / lot.',

  // Oaziz processing
  oazizProcessingTitle: 'Transformation Oaziz',
  oazizProcessingLabel: 'Transformation, emballage et transport par gramme (CA$/g)',
  oazizProcessingHint: 'Appliqué au rendement post-presse (après lavage et pressage), pas à la matière première brute.',

  // Yield (input section)
  yieldTitle: 'Rendement',
  washYieldLabel: 'Rendement du lavage (%)',
  pressYieldLabel: 'Rendement de presse (%)',
  retainedOazizLabel: 'Échantillon retenu — Oaziz (g)',
  retainedAgMedicaLabel: 'Échantillon retenu — AgMedica (g)',
  retainedRxLabel: 'Échantillon retenu — RX (g)',

  // One-time costs
  oneTimeCostsTitle: 'Coûts uniques',
  lpAuditFeeLabel: "Frais d'audit LP (CA$)",
  productValidationLabel: 'Validation du produit par souche (CA$)',
  packagingFormeLabel: 'Emballage — forme de découpe composite, unique (£)',
  oneTimeCostsHint: 'Étude de stabilité par souche : confirmée à 0 $ — omise du calcul.',

  // AgMedica costs
  agMedicaCostsTitle: 'Coûts AgMedica (transformation côté Canada)',
  agMedicaProcessingLabel: 'Fabrication et transformation par gramme (CA$/g)',
  agMedicaShippingLabel: 'Expédition AgMedica → RX UK, forfaitaire (CA$)',

  // Tolling reference table (fixed, static)
  tollingTableTitle: 'Coûts de tolling RX UK par palier de lot',
  tollingTableHint: 'Table de référence fixe — non modifiable.',
  tollingColTier: 'Palier',
  tollingColFill: 'Remplissage vape (CA$/u)',
  tollingColCart: 'Cartouche (CA$/u)',
  tollingColPick: 'Cueillette & emballage (CA$/u)',
  tollingColPack: 'Emballage (CA$/u)',
  tollingColTotal: 'Total tolling (CA$/u)',

  // Tier names — shared between the static reference table and the dynamic
  // client-rendered tables (passed through the JSON data island)
  tier500Label: '500–999 unités',
  tier1000Label: '1000–1999 unités',
  tier2000Label: '2000–4999 unités',
  tier5000Label: '5000+ unités',

  // Other RX costs
  otherRxTitle: 'Autres coûts RX',
  incomingOutgoingLabel: 'Tests entrants/sortants (CA$)',
  rxLabTestingLabel: 'Test de labo RX (3e labo, sur échantillon 150 g) (CA$)',

  // Per-cart cost decomposition (input section)
  cartBreakdownTitle: 'Décomposition du coût par cartouche',
  cartFillWeightLabel: 'Poids de remplissage par cartouche (g/cart)',

  // Margin analysis (input section)
  marginAnalysisSectionTitle: 'Analyse de marge',
  wholesalePriceLabel: 'Prix de gros par unité (£)',

  // ---- Client-script result strings (used via the JSON data island) ----
  warnMaterialQty: 'La quantité de matière première doit être supérieure à 0.',
  warnProductAvailable:
    '⚠ Le produit disponible est nul ou négatif — les échantillons retenus dépassent le rendement post-presse.',
  warnCartFillWeight: 'Le poids de remplissage par cartouche doit être supérieur à 0.',

  yieldCardTitle: 'Chaîne de rendement',
  yieldPostWash: 'Rendement post-lavage',
  yieldPostPress: 'Rendement post-presse',
  yieldTotalAvailable: 'Total produit disponible',
  yieldCartsProducible: 'Cartouches réalisables',
  yieldHint:
    'Produit disponible = rendement post-presse − échantillons retenus (Oaziz {oaziz}, AgMedica {agMedica}, RX {rx}).',

  costPoolsTitle: 'Bassins de coûts',
  costLineMaterial: 'Coût total de la matière première',
  costLineLabTests: 'Coût total des tests de labo (COA)',
  costLineLabTestsSuffix: "/g d'intrant",
  costLineOazizProcessing: 'Coût de transformation Oaziz (post-presse)',
  costLineOneTime: 'Coûts uniques (audit, validation, emballage)',
  costLineAgMedica: 'Coûts AgMedica (transformation + expédition)',
  costLineOtherRx: 'Autres coûts RX (tests entrants/sortants + labo RX)',
  costLineBulkRosin: 'Coût du rosin en vrac ($/g de produit disponible)',
  bulkRosinUnitSuffix: '/g',
  costLineTotalFixed: 'Total des coûts véritablement fixes (amortis sur les cartouches)',

  costPerCartTitle: 'Coût par cartouche, selon le palier de tolling',
  applicableNoteApplies: '★ Palier applicable au volume actuel ({units} cartouches) : {tier}',
  applicableNoteNone:
    "Aucun palier de tolling ne s'applique — le volume de cartouches produit ({units}) est sous le minimum de 500 unités.",
  costTableColTier: 'Palier',
  costTableColTolling: 'Tolling/cart',
  costTableColVariableRosin: 'Rosin variable/cart',
  costTableColFixedAmortized: 'Fixe amorti/cart',
  costTableColTotalCad: 'Total/cart (CA$)',
  costTableColTotalGbp: 'Total/cart (£)',

  marginTitle: 'Analyse de marge, selon le palier de tolling',
  marginColTier: 'Palier',
  marginColWholesale: 'Gros/cart (CA$)',
  marginColProfit: 'Profit/cart (CA$)',
  marginColMarginPct: 'Marge %',
  marginColBatchProfit: 'Profit total du lot',
} as const;

export type ExportRoyaumeUniVapeDict = typeof frExportRoyaumeUniVape;

export const enExportRoyaumeUniVape: Partial<Record<keyof ExportRoyaumeUniVapeDict, string>> = {
  backLink: '← Back to calculators',
  pageTitle: 'UK Export — Vape',
  pageIntro:
    'Models the Oaziz Extracts → AgMedica (Canada) → RX Distributor (UK) → Grow Group UK → UK Retail pathway, ' +
    'from raw trim to cost per vape cartridge by tolling volume tier, with margin analysis.',

  currenciesTitle: 'Currencies',
  gbpToCadLabel: 'GBP → CAD exchange rate',
  cadToGbpLabel: 'CAD → GBP rate (derived)',

  startingMaterialTitle: 'Starting material',
  totalInputLabel: 'Grams of raw material (trim/heads)',
  costPerGLabel: 'Cost per gram (CA$/g)',

  labTestsTitle: 'Lab tests (COA)',
  numLotsLabel: 'Number of lots/strains',
  labTestsHint: 'Cost per COA (fixed, not editable): Test A $1,750.00 + Test B $3,675.00 = $5,425.00 / lot.',

  oazizProcessingTitle: 'Oaziz processing',
  oazizProcessingLabel: 'Processing, packaging and shipping per gram (CA$/g)',
  oazizProcessingHint: 'Applied to the post-press yield (after washing and pressing), not the raw starting material.',

  yieldTitle: 'Yield',
  washYieldLabel: 'Wash yield (%)',
  pressYieldLabel: 'Press yield (%)',
  retainedOazizLabel: 'Retained sample — Oaziz (g)',
  retainedAgMedicaLabel: 'Retained sample — AgMedica (g)',
  retainedRxLabel: 'Retained sample — RX (g)',

  oneTimeCostsTitle: 'One-time costs',
  lpAuditFeeLabel: 'LP audit fee (CA$)',
  productValidationLabel: 'Product validation per strain (CA$)',
  packagingFormeLabel: 'Packaging — composite die-cut form, one-time (£)',
  oneTimeCostsHint: 'Stability study per strain: confirmed at $0 — omitted from the calculation.',

  agMedicaCostsTitle: 'AgMedica costs (Canada-side processing)',
  agMedicaProcessingLabel: 'Manufacturing and processing per gram (CA$/g)',
  agMedicaShippingLabel: 'AgMedica → RX UK shipping, flat rate (CA$)',

  tollingTableTitle: 'RX UK tolling costs by batch tier',
  tollingTableHint: 'Fixed reference table — not editable.',
  tollingColTier: 'Tier',
  tollingColFill: 'Vape fill (CA$/u)',
  tollingColCart: 'Cartridge (CA$/u)',
  tollingColPick: 'Pick & pack (CA$/u)',
  tollingColPack: 'Packaging (CA$/u)',
  tollingColTotal: 'Total tolling (CA$/u)',

  tier500Label: '500–999 units',
  tier1000Label: '1000–1999 units',
  tier2000Label: '2000–4999 units',
  tier5000Label: '5000+ units',

  otherRxTitle: 'Other RX costs',
  incomingOutgoingLabel: 'Incoming/outgoing testing (CA$)',
  rxLabTestingLabel: 'RX lab testing (3rd lab, on 150 g sample) (CA$)',

  cartBreakdownTitle: 'Per-cartridge cost breakdown',
  cartFillWeightLabel: 'Fill weight per cartridge (g/cart)',

  marginAnalysisSectionTitle: 'Margin analysis',
  wholesalePriceLabel: 'Wholesale price per unit (£)',

  warnMaterialQty: 'The raw material quantity must be greater than 0.',
  warnProductAvailable:
    '⚠ Available product is zero or negative — the retained samples exceed the post-press yield.',
  warnCartFillWeight: 'The fill weight per cartridge must be greater than 0.',

  yieldCardTitle: 'Yield chain',
  yieldPostWash: 'Post-wash yield',
  yieldPostPress: 'Post-press yield',
  yieldTotalAvailable: 'Total product available',
  yieldCartsProducible: 'Cartridges producible',
  yieldHint:
    'Available product = post-press yield − retained samples (Oaziz {oaziz}, AgMedica {agMedica}, RX {rx}).',

  costPoolsTitle: 'Cost pools',
  costLineMaterial: 'Total raw material cost',
  costLineLabTests: 'Total lab test cost (COA)',
  costLineLabTestsSuffix: '/g of input',
  costLineOazizProcessing: 'Oaziz processing cost (post-press)',
  costLineOneTime: 'One-time costs (audit, validation, packaging)',
  costLineAgMedica: 'AgMedica costs (processing + shipping)',
  costLineOtherRx: 'Other RX costs (incoming/outgoing testing + RX lab)',
  costLineBulkRosin: 'Bulk rosin cost ($/g of available product)',
  bulkRosinUnitSuffix: '/g',
  costLineTotalFixed: 'Total truly fixed costs (amortized over cartridges)',

  costPerCartTitle: 'Cost per cartridge, by tolling tier',
  applicableNoteApplies: '★ Tier applicable at current volume ({units} cartridges): {tier}',
  applicableNoteNone:
    'No tolling tier applies — the cartridge volume produced ({units}) is below the 500-unit minimum.',
  costTableColTier: 'Tier',
  costTableColTolling: 'Tolling/cart',
  costTableColVariableRosin: 'Variable rosin/cart',
  costTableColFixedAmortized: 'Amortized fixed/cart',
  costTableColTotalCad: 'Total/cart (CA$)',
  costTableColTotalGbp: 'Total/cart (£)',

  marginTitle: 'Margin analysis, by tolling tier',
  marginColTier: 'Tier',
  marginColWholesale: 'Wholesale/cart (CA$)',
  marginColProfit: 'Profit/cart (CA$)',
  marginColMarginPct: 'Margin %',
  marginColBatchProfit: 'Total batch profit',
};
