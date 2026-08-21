export const frExportSuisse = {
  pageTitle: 'Export Suisse — Kief / Blocs pressés',
  backLink: '← Retour aux calculatrices',
  heading: 'Export Suisse — Kief / Blocs pressés',
  intro:
    'Modélise le parcours Fournisseur de kief → Oaziz → Vertical 7 → Suisse : kief pressé en blocs, décompte ' +
    'complet des coûts et prix de vente selon la majoration appliquée.',

  transactionHeading: 'Transaction',
  totalVolumeLabel: 'Volume total (g)',
  blockSizeLabel: 'Taille du bloc pressé (g/bloc)',
  jarCountLabel: 'Nombre de blocs (dérivé)',

  costHeading: 'Postes de coût',
  kiefPurchaseLabel: "Kief — prix d'achat ($/g)",
  shippingSupplierLabel: 'Expédition fournisseur de kief → Oaziz (forfaitaire $)',
  vacuumSealLabel: 'Scellage sous vide + pesée + pressage ($/g)',
  exportPermitLabel: "Permis d'exportation (forfaitaire $)",
  vertical7Label: 'Frais Vertical 7 ($/g)',
  jarPackagingLabel: 'Emballage — pots ($/pot)',
  packagingLabourLabel: "Emballage — main-d'œuvre ($/g)",
  shippingToVertical7Label: 'Expédition Oaziz → Vertical 7 (forfaitaire $)',
  shippingToSwitzerlandLabel: 'Expédition Vertical 7 → Suisse ($/g)',
  fullCoaLabel: 'COA complet High North (forfaitaire $)',

  priceHeading: 'Prix',
  markupLabel: 'Majoration (%)',

  // Client-side (result panel built by <script>)
  warnVolume: 'Le volume total doit être supérieur à 0.',

  breakdownHeading: 'Décompte du coût total',
  kiefPurchaseLine: 'Kief — achat',
  shippingSupplierLine: 'Expédition fournisseur de kief → Oaziz',
  vacuumSealLine: 'Scellage sous vide + pesée + pressage',
  exportPermitLine: "Permis d'exportation",
  vertical7Line: 'Frais Vertical 7',
  jarPackagingLine: 'Emballage — pots',
  packagingLabourLine: "Emballage — main-d'œuvre",
  shippingToVertical7Line: 'Expédition Oaziz → Vertical 7',
  shippingToSwitzerlandLine: 'Expédition Vertical 7 → Suisse',
  fullCoaLine: 'COA complet High North',
  totalCostLine: 'Coût total',
  costPerGramLabel: '★ COÛT / GRAMME',

  summaryHeading: 'Résumé de la transaction',
  summaryVolumeLine: 'Volume total',
  summaryCostPerGramLine: 'Coût / gramme',
  summaryMarkupLine: 'Majoration',
  summarySellPriceLine: 'Prix de vente / gramme',
  summaryRevenueLine: 'Revenu total',
  summaryProfitLine: 'Profit brut',
  summaryMarginLine: 'Marge brute',
  splitLine: 'Portion 50 % – 50 % du profit',
  splitReferenceLine: 'Référence — structure de partage de profit',
} as const;

export type ExportSuisseDict = typeof frExportSuisse;

export const enExportSuisse: Partial<Record<keyof ExportSuisseDict, string>> = {
  pageTitle: 'Switzerland Export — Kief / Pressed blocks',
  backLink: '← Back to calculators',
  heading: 'Switzerland Export — Kief / Pressed blocks',
  intro:
    'Models the Kief supplier → Oaziz → Vertical 7 → Switzerland pathway: kief pressed into blocks, full cost ' +
    'breakdown, and sell price based on the applied markup.',

  transactionHeading: 'Transaction',
  totalVolumeLabel: 'Total volume (g)',
  blockSizeLabel: 'Pressed block size (g/block)',
  jarCountLabel: 'Number of blocks (derived)',

  costHeading: 'Cost items',
  kiefPurchaseLabel: 'Kief — purchase price ($/g)',
  shippingSupplierLabel: 'Shipping, kief supplier → Oaziz (flat $)',
  vacuumSealLabel: 'Vacuum sealing + weighing + pressing ($/g)',
  exportPermitLabel: 'Export permit (flat $)',
  vertical7Label: 'Vertical 7 fee ($/g)',
  jarPackagingLabel: 'Packaging — jars ($/jar)',
  packagingLabourLabel: 'Packaging — labour ($/g)',
  shippingToVertical7Label: 'Shipping, Oaziz → Vertical 7 (flat $)',
  shippingToSwitzerlandLabel: 'Shipping, Vertical 7 → Switzerland ($/g)',
  fullCoaLabel: 'Full COA, High North (flat $)',

  priceHeading: 'Price',
  markupLabel: 'Markup (%)',

  warnVolume: 'Total volume must be greater than 0.',

  breakdownHeading: 'Total cost breakdown',
  kiefPurchaseLine: 'Kief — purchase',
  shippingSupplierLine: 'Shipping, kief supplier → Oaziz',
  vacuumSealLine: 'Vacuum sealing + weighing + pressing',
  exportPermitLine: 'Export permit',
  vertical7Line: 'Vertical 7 fee',
  jarPackagingLine: 'Packaging — jars',
  packagingLabourLine: 'Packaging — labour',
  shippingToVertical7Line: 'Shipping, Oaziz → Vertical 7',
  shippingToSwitzerlandLine: 'Shipping, Vertical 7 → Switzerland',
  fullCoaLine: 'Full COA, High North',
  totalCostLine: 'Total cost',
  costPerGramLabel: '★ COST / GRAM',

  summaryHeading: 'Transaction summary',
  summaryVolumeLine: 'Total volume',
  summaryCostPerGramLine: 'Cost / gram',
  summaryMarkupLine: 'Markup',
  summarySellPriceLine: 'Sell price / gram',
  summaryRevenueLine: 'Total revenue',
  summaryProfitLine: 'Gross profit',
  summaryMarginLine: 'Gross margin',
  splitLine: '50 / 50 profit share portion',
  splitReferenceLine: 'Reference — profit-share structure',
};
