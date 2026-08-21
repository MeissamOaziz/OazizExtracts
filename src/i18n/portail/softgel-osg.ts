export const frSoftgelOsg = {
  // Page chrome
  backLink: '← Retour aux calculatrices',
  pageTitle: 'Prix des softgels OSG (CBD/CBN)',
  pageIntro:
    "Cascade de prix pour les capsules softgel produites par Olds Softgel Ltd. (OSG) — départ usine Olds, AB. " +
    "Basé sur la grille de prix OSG, avec une majoration Oaziz et une majoration du distributeur en aval, " +
    "plus un module d'embouteillage optionnel.",

  // Product selection card
  selectionCardTitle: 'Sélection du produit',
  productTypeLabel: 'Type de produit',
  doseLabel: 'Dosage',
  volumeTierLabel: 'Palier de volume',
  selectionHint: 'Les options de dosage et de palier de volume dépendent du type de produit sélectionné.',

  // Fixed OSG price grid card
  priceGridCardTitle: 'Grille de prix de base OSG (référence fixe)',
  priceGridHint: 'CA$ par 1 000 capsules, départ usine Olds AB — non éditable.',
  priceGridColProduct: 'Produit',

  // Cost & markup assumptions card
  assumptionsCardTitle: 'Hypothèses de coût et de majoration',
  oazizMarkupLabel: 'Majoration Oaziz (%)',
  distributorMarkupLabel: 'Majoration du distributeur (%)',
  transportCostLabel: 'Coût de transport (CA$ / 1000 capsules)',

  // Bottling add-on card
  bottlingCardTitle: "Module d'embouteillage (optionnel)",
  bottleTierLabel: 'Format de bouteille (capsules)',
  bottleSuppliedByLabel: 'Bouteille fournie par',
  bottleSuppliedByOsg: 'OSG',
  bottleSuppliedByCustomer: 'Client',
  bottlingHint:
    "Ce module est indépendant de la cascade de prix des capsules ci-dessus — il partage uniquement les majorations Oaziz et distributeur.",

  // Client-script result strings (used via the JSON data island)
  warnVolumeTier:
    "⚠ Ce palier de volume n'est pas offert pour {key} (S/O dans la grille OSG). Choisissez un autre palier.",
  warnBottleCombo: '⚠ Combinaison de format de bouteille invalide.',
  waterfallTitle: 'Cascade de prix — {key}, {volumeTier}',
  colStep: 'Étape',
  colPer1000: 'CA$ / 1000 capsules',
  colPerCapsule: 'CA$ / capsule',
  rowOsgCost: 'Coût OSG (Oaziz achète à)',
  rowTransportCost: 'Coût de transport',
  rowLandedCost: 'Coût total rendu',
  rowOazizSellingPrice: 'Prix de vente Oaziz (+{pct}%)',
  rowOazizGrossMargin: 'Marge brute Oaziz',
  rowDistributorEndPrice: 'Prix final distributeur (+{pct}%)',
  bottleResultTitle: "Module d'embouteillage — résultat",
  bottleOsgCostLabel: 'Coût bouteille OSG',
  bottleOazizSellLabel: 'Prix de vente Oaziz / bouteille',
  bottleDistributorEndLabel: 'Prix final distributeur / bouteille',
} as const;

export type SoftgelOsgDict = typeof frSoftgelOsg;

export const enSoftgelOsg: Partial<Record<keyof SoftgelOsgDict, string>> = {
  backLink: '← Back to calculators',
  pageTitle: 'OSG Softgel Pricing (CBD/CBN)',
  pageIntro:
    'Price waterfall for softgel capsules produced by Olds Softgel Ltd. (OSG) — ex-works Olds, AB. ' +
    "Based on the OSG price grid, with an Oaziz markup and a downstream distributor markup, " +
    'plus an optional bottling add-on module.',

  selectionCardTitle: 'Product selection',
  productTypeLabel: 'Product type',
  doseLabel: 'Dose',
  volumeTierLabel: 'Volume tier',
  selectionHint: 'The dose and volume tier options depend on the selected product type.',

  priceGridCardTitle: 'Base OSG price grid (fixed reference)',
  priceGridHint: 'CA$ per 1,000 capsules, ex-works Olds AB — not editable.',
  priceGridColProduct: 'Product',

  assumptionsCardTitle: 'Cost and markup assumptions',
  oazizMarkupLabel: 'Oaziz markup (%)',
  distributorMarkupLabel: 'Distributor markup (%)',
  transportCostLabel: 'Transport cost (CA$ / 1000 capsules)',

  bottlingCardTitle: 'Bottling module (optional)',
  bottleTierLabel: 'Bottle format (capsules)',
  bottleSuppliedByLabel: 'Bottle supplied by',
  bottleSuppliedByOsg: 'OSG',
  bottleSuppliedByCustomer: 'Customer',
  bottlingHint:
    "This module is independent from the capsule price waterfall above — it only shares the Oaziz and distributor markups.",

  warnVolumeTier:
    '⚠ This volume tier is not available for {key} (N/A in the OSG price grid). Choose another tier.',
  warnBottleCombo: '⚠ Invalid bottle format combination.',
  waterfallTitle: 'Price waterfall — {key}, {volumeTier}',
  colStep: 'Step',
  colPer1000: 'CA$ / 1000 capsules',
  colPerCapsule: 'CA$ / capsule',
  rowOsgCost: 'OSG cost (Oaziz buys at)',
  rowTransportCost: 'Transport cost',
  rowLandedCost: 'Total landed cost',
  rowOazizSellingPrice: 'Oaziz selling price (+{pct}%)',
  rowOazizGrossMargin: 'Oaziz gross margin',
  rowDistributorEndPrice: 'Distributor end price (+{pct}%)',
  bottleResultTitle: 'Bottling module — result',
  bottleOsgCostLabel: 'OSG bottle cost',
  bottleOazizSellLabel: 'Oaziz selling price / bottle',
  bottleDistributorEndLabel: 'Distributor end price / bottle',
};
