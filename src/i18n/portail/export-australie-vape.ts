export const frExportAustralieVape = {
  pageTitle: 'Export Australie — Vape',
  backLink: '← Retour aux calculatrices',
  heading: 'Export Australie — Vape',
  intro:
    "Modélise le parcours Oaziz Extracts (Montréal) → transformation vape → partenaire de distribution australien → marché australien, sur la base d'estimations internes et de la soumission logistique Beam Suntory.",

  currencySectionTitle: 'Devises',
  fxRateLabel: 'Taux de conversion CAD → AUD',
  fxRateDerivedLabel: 'Taux AUD → CAD (dérivé)',

  startingMaterialSectionTitle: 'Matière de départ',
  rawMaterialGramsLabel: 'Grammes de matière première (trim/têtes)',
  costPerGramLabel: 'Coût par gramme (CA$/g)',

  labTestsSectionTitle: 'Tests de laboratoire',
  numLotsLabel: 'Nombre de lots/souches',
  oazizCoaLabel: 'Coût COA Oaziz (CA$, par lot)',
  australianCoaLabel: 'Coût COA australien (CA$, par lot)',

  processingSectionTitle: 'Transformation Oaziz',
  processingCostLabel: 'Transformation, emballage et transport par gramme (CA$/g)',
  processingHint: "Appliqué sur les grammes de matière première en entrée (et non sur le rendement extrait).",

  yieldSectionTitle: 'Rendement',
  washYieldLabel: 'Rendement du lavage (%)',
  pressYieldLabel: 'Rendement de presse (%)',
  yieldHint:
    'Échantillons retenus (Oaziz + contingence) : 7,5 % chacun du rendement post-presse — fixe, non modifiable.',

  oneTimeCostsSectionTitle: 'Coûts uniques',
  lpAuditFeeLabel: "Frais d'audit LP (CA$)",
  productValidationLabel: 'Validation du produit (CA$, par souche)',
  stabilityStudyLabel: 'Étude de stabilité (CA$, par souche)',

  fillingSectionTitle: 'Emballage et remplissage australien',
  fillingTierLabel: 'Palier de remplissage',
  tierLowOption: 'Low (A$14 × taux)',
  tierHighOption: 'High (A$18 × taux)',
  tierCustomOption: 'Custom',
  customFillCostLabel: 'Coût de remplissage personnalisé par unité (CA$)',
  fillingHint: '1 unité = 1 gramme de remplissage (correspond à la feuille source).',

  markupSectionTitle: 'Majoration',
  markupLabel: 'Majoration Oaziz (%)',

  // Client-side (result panel) strings
  warnMaterialZero: 'La quantité de matière première doit être supérieure à 0.',
  yieldBreakdownTitle: 'Rendement — de la matière première au produit disponible',
  rawMaterialInputLine: 'Matière première (entrée)',
  postWashLine: 'Post-lavage',
  postPressLine: 'Post-presse',
  retainedOazizLine: 'Échantillon retenu Oaziz (7,5 %)',
  retainedContingencyLine: 'Échantillon retenu contingence (7,5 %)',
  productAvailableLine: 'Produit disponible (unités)',
  gramsUnitsSuffix: 'g / unités',

  costSummaryTitle: 'Résumé des coûts',
  thComponent: 'Composante',
  thTotalCad: 'Total (CA$)',
  thPerUnitCad: 'Coût/unité (CA$)',
  thPerUnitAud: 'Coût/unité (AU$)',

  compRawMaterial: 'Matière première',
  compLabTests: 'Tests de laboratoire',
  compProcessing: 'Transformation Oaziz',
  compOneTime: 'Coûts uniques (démarrage)',
  compFilling: 'Remplissage australien',

  totalBatchRowLabel: 'Coût total du lot',
  headlineCostPerUnit: '★ COÛT / UNITÉ INCL. MAJORATION (FOB MONTRÉAL)',
  equivalentLabel: 'Équivalent',
  costPerUnitBeforeMarkup: 'Coût / unité avant majoration',
} as const;

export type ExportAustralieVapeDict = typeof frExportAustralieVape;

export const enExportAustralieVape: Partial<Record<keyof ExportAustralieVapeDict, string>> = {
  pageTitle: 'Australia Export — Vape',
  backLink: '← Back to calculators',
  heading: 'Australia Export — Vape',
  intro:
    "Models the Oaziz Extracts (Montreal) → vape processing → Australian distribution partner → Australian market journey, based on internal estimates and the Beam Suntory logistics quote.",

  currencySectionTitle: 'Currencies',
  fxRateLabel: 'CAD → AUD conversion rate',
  fxRateDerivedLabel: 'AUD → CAD rate (derived)',

  startingMaterialSectionTitle: 'Starting material',
  rawMaterialGramsLabel: 'Grams of raw material (trim/tops)',
  costPerGramLabel: 'Cost per gram (CA$/g)',

  labTestsSectionTitle: 'Lab tests',
  numLotsLabel: 'Number of lots/strains',
  oazizCoaLabel: 'Oaziz COA cost (CA$, per lot)',
  australianCoaLabel: 'Australian COA cost (CA$, per lot)',

  processingSectionTitle: 'Oaziz processing',
  processingCostLabel: 'Processing, packaging and transport per gram (CA$/g)',
  processingHint: 'Applied to the input raw material grams (not to the extracted yield).',

  yieldSectionTitle: 'Yield',
  washYieldLabel: 'Wash yield (%)',
  pressYieldLabel: 'Press yield (%)',
  yieldHint:
    'Retained samples (Oaziz + contingency): 7.5% each of post-press yield — fixed, not editable.',

  oneTimeCostsSectionTitle: 'One-time costs',
  lpAuditFeeLabel: 'LP audit fee (CA$)',
  productValidationLabel: 'Product validation (CA$, per strain)',
  stabilityStudyLabel: 'Stability study (CA$, per strain)',

  fillingSectionTitle: 'Australian packaging and filling',
  fillingTierLabel: 'Filling tier',
  tierLowOption: 'Low (A$14 × rate)',
  tierHighOption: 'High (A$18 × rate)',
  tierCustomOption: 'Custom',
  customFillCostLabel: 'Custom filling cost per unit (CA$)',
  fillingHint: '1 unit = 1 gram of filling (matches the source sheet).',

  markupSectionTitle: 'Markup',
  markupLabel: 'Oaziz markup (%)',

  // Client-side (result panel) strings
  warnMaterialZero: 'The raw material quantity must be greater than 0.',
  yieldBreakdownTitle: 'Yield — from raw material to available product',
  rawMaterialInputLine: 'Raw material (input)',
  postWashLine: 'Post-wash',
  postPressLine: 'Post-press',
  retainedOazizLine: 'Retained sample Oaziz (7.5%)',
  retainedContingencyLine: 'Retained sample contingency (7.5%)',
  productAvailableLine: 'Available product (units)',
  gramsUnitsSuffix: 'g / units',

  costSummaryTitle: 'Cost summary',
  thComponent: 'Component',
  thTotalCad: 'Total (CA$)',
  thPerUnitCad: 'Cost/unit (CA$)',
  thPerUnitAud: 'Cost/unit (AU$)',

  compRawMaterial: 'Raw material',
  compLabTests: 'Lab tests',
  compProcessing: 'Oaziz processing',
  compOneTime: 'One-time costs (startup)',
  compFilling: 'Australian filling',

  totalBatchRowLabel: 'Total batch cost',
  headlineCostPerUnit: '★ COST / UNIT INCL. MARKUP (FOB MONTREAL)',
  equivalentLabel: 'Equivalent',
  costPerUnitBeforeMarkup: 'Cost / unit before markup',
};
