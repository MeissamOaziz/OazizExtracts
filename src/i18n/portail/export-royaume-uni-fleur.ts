export const frExportRoyaumeUniFleur = {
  pageTitle: 'Export Royaume-Uni — Fleur',
  backLink: '← Retour aux calculatrices',
  heading: 'Export Royaume-Uni — Fleur',
  intro:
    "Modélise le parcours Oaziz Extracts → AgMedica (Canada) → RX Distributor (Royaume-Uni) → détail/pharmacie UK, " +
    "sur la base de la soumission de RX UK Partner et des coûts AgMedica. Compare le coût par gramme selon la " +
    "taille d'unité d'emballage.",

  fxHeading: 'Devises (FX)',
  gbpToCadLabel: 'Taux de conversion GBP → CAD',
  cadToGbpLabel: 'Taux CAD → GBP (dérivé)',

  lotAssumptionsHeading: 'Hypothèses du lot',
  lotSizeLabel: 'Taille du lot (g)',
  flowerCostLabel: 'Coût de la fleur par gramme (CA$/g)',
  exportPermitLabel: "Coût du permis d'exportation par gramme (CA$/g)",
  shippingLabel: "Coût d'expédition par gramme, Canada → UK (CA$/g)",
  highNorthCoaLabel: 'Coût COA High North (CA$, forfaitaire par lot)',
  permitsGmpCoaLabel: 'Permis entrants/sortants + COA GMP (CA$, forfaitaire par lot)',

  // Client-side (result panel built by <script>)
  warnLotSize: 'La taille du lot doit être supérieure à 0.',

  breakdownHeading: 'Décompte du coût total du lot',
  flowerCostLine: 'Coût de la fleur ({g} × {rate}/g)',
  exportPermitLine: "Permis d'exportation",
  shippingLine: 'Expédition Canada → UK',
  highNorthCoaLine: 'COA High North',
  permitsGmpCoaLine: 'Permis entrants/sortants + COA GMP',
  totalLotCostLine: 'Coût total du lot',
  costPerGramLabel: '★ COÛT / GRAMME',
  equivalentLabel: 'Équivalent',

  unitCompareHeading: "Comparaison par taille d'unité d'emballage",
  unitCompareHint:
    "Coût du lot réparti sur le nombre d'unités obtenues, plus le coût d'emballage propre à chaque format " +
    '(soumission RX UK). La ligne surlignée est le format le moins coûteux par gramme.',
  tableFormat: 'Format',
  tableUnitsFromLot: 'Unités du lot',
  tableCostPerUnit: 'Coût / unité',
  tableCostPerUnitGbp: 'Coût / unité (£)',
  tableCostPerGram: 'Coût / g',
  tableCostPerGramGbp: 'Coût / g (£)',
  footnote:
    '* Prix hors TVA. * Emballage secondaire non inclus. * Test de stabilité : £750–£2,000 par souche par an (non inclus).',
} as const;

export type ExportRoyaumeUniFleurDict = typeof frExportRoyaumeUniFleur;

export const enExportRoyaumeUniFleur: Partial<Record<keyof ExportRoyaumeUniFleurDict, string>> = {
  pageTitle: 'UK Export — Flower',
  backLink: '← Back to calculators',
  heading: 'UK Export — Flower',
  intro:
    'Models the Oaziz Extracts → AgMedica (Canada) → RX Distributor (UK) → UK retail/pharmacy pathway, based on ' +
    "the RX UK Partner submission and AgMedica costs. Compares cost per gram across packaging unit sizes.",

  fxHeading: 'Currency (FX)',
  gbpToCadLabel: 'GBP → CAD conversion rate',
  cadToGbpLabel: 'CAD → GBP rate (derived)',

  lotAssumptionsHeading: 'Lot assumptions',
  lotSizeLabel: 'Lot size (g)',
  flowerCostLabel: 'Flower cost per gram (CA$/g)',
  exportPermitLabel: 'Export permit cost per gram (CA$/g)',
  shippingLabel: 'Shipping cost per gram, Canada → UK (CA$/g)',
  highNorthCoaLabel: 'High North COA cost (CA$, flat per lot)',
  permitsGmpCoaLabel: 'Inbound/outbound permits + GMP COA (CA$, flat per lot)',

  warnLotSize: 'Lot size must be greater than 0.',

  breakdownHeading: 'Total lot cost breakdown',
  flowerCostLine: 'Flower cost ({g} × {rate}/g)',
  exportPermitLine: 'Export permit',
  shippingLine: 'Shipping Canada → UK',
  highNorthCoaLine: 'High North COA',
  permitsGmpCoaLine: 'Inbound/outbound permits + GMP COA',
  totalLotCostLine: 'Total lot cost',
  costPerGramLabel: '★ COST / GRAM',
  equivalentLabel: 'Equivalent',

  unitCompareHeading: 'Comparison by packaging unit size',
  unitCompareHint:
    'Lot cost spread over the number of units yielded, plus the packaging cost specific to each format ' +
    '(RX UK submission). The highlighted row is the lowest cost per gram format.',
  tableFormat: 'Format',
  tableUnitsFromLot: 'Units from lot',
  tableCostPerUnit: 'Cost / unit',
  tableCostPerUnitGbp: 'Cost / unit (£)',
  tableCostPerGram: 'Cost / g',
  tableCostPerGramGbp: 'Cost / g (£)',
  footnote:
    '* Prices exclude VAT. * Secondary packaging not included. * Stability testing: £750–£2,000 per strain per year (not included).',
};
