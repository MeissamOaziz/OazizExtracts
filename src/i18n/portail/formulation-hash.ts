export const frFormulationHash = {
  // Page chrome
  pageTitleTag: 'Calculatrice de formulation de Hash',
  backLink: '← Retour aux calculatrices',
  pageTitle: 'Formulation de Hash',
  pageIntro: 'Basé sur le modèle « Oaziz Hash Formulation Calculator ».',

  // Tabs
  tabSqdc: 'SQDC — dilution',
  tabDom: 'DOM — boost',

  // SQDC tab — static labels
  sqdcIntro:
    "Le kief (33–34 % THC) dépasse déjà le cap SQDC — le distillat CBD, l'isolat et le terpène diluent " +
    "vers le bas. Entrez les puissances réelles (COA) de ce lot ; la recette se recalcule pour respecter " +
    "les cibles avec le moins d'isolat/terpène possible.",
  cardRawMaterials: 'Coûts &amp; puissances des matières premières',
  kiefCostLabel: 'Coût kief ($/g)',
  kiefThcLabel: 'Puissance THC du kief, ce lot — COA (%)',
  distCostCbdLabel: 'Coût distillat CBD ($/g)',
  distCbdLabel: 'Puissance CBD du distillat, ce lot — COA (%)',
  isolateCostLabel: 'Coût isolat CBN/CBG ($/g)',
  terpCostLabel: 'Coût terpène ($/mL)',
  terpDensityLabel: 'Densité terpène (g/mL)',
  densityHint:
    "⚠ Densité estimée — confirmer avec le fournisseur, c'est le plus gros facteur de variation de coût si un terpène est utilisé.",
  cardTargetsCompliance: 'Cibles de conformité',
  maxThcLabel: 'THC max autorisé, produit fini (%)',
  maxCbdLabel: 'CBD max autorisé, produit fini — cap (%)',
  cbdFillLevelLabel: 'Niveau de remplissage CBD visé (%)',
  terpFractionLabel: 'Fraction de terpène à utiliser (% du lot)',
  fillLevelHint:
    "Réglez le remplissage CBD = au cap pour minimiser le coût d'isolat ; baissez-le pour une marge de sécurité.",
  cardBatchPrice: 'Lot &amp; prix',
  batchKgLabel: 'Taille du lot (kg)',
  sellPriceLabel: 'Prix de vente ($/g, produit fini)',
  currentCostLabel: 'Coût actuel tout compris ($/g) — méthode trim → kief, référence',

  // DOM tab — static labels
  domIntro:
    'Mélange de <strong>boost</strong>, pas de dilution : le kief (33–34 % THC) est sous la cible, donc ' +
    "du distillat THC (bien plus puissant) est ajouté pour monter la moyenne — l'inverse du hash SQDC.",
  distCostThcLabel: 'Coût distillat THC ($/g)',
  distThcLabel: 'Puissance THC du distillat, ce lot — COA (%)',
  cardSpecCompliance: 'Cibles de conformité / spécification',
  domThcTargetLabel: 'THC cible de conception (%)',
  domMaxThcLabel: 'THC max autorisé, produit fini — cap (%)',
  domHintLowerTarget:
    'Une cible plus basse = plus de kief (bon marché), moins de distillat (cher) = coût plus bas.',
  domHintCbdCap:
    'CBD max autorisé, produit fini — cap : 10 %. Toujours respecté : ni le kief ni le distillat THC ne portent de CBD significatif.',
  domSellPriceLabel: 'Prix de vente ($/g, produit fini) — optionnel',

  // Client-script result strings (used via the JSON data island)
  batchSizeWarning: 'La taille du lot doit être supérieure à 0.',
  feasibleOk: '✓ Recette faisable',
  sqdcInfeasible:
    "⚠ INFAISABLE — la fraction d'isolat est négative. Le kief + distillat + terpène dépassent déjà 100 % à eux seuls ; augmentez le cap THC, baissez le remplissage CBD, ou réduisez le terpène.",
  cbdCapExceeded:
    '⚠ Le remplissage CBD visé ({fill}) dépasse le cap autorisé ({cap}) — non conforme.',
  recipeCardTitle: 'Recette (minimisant le coût)',
  ingredientKief: 'Kief',
  ingredientDistCbd: 'Distillat CBD',
  ingredientTerp: 'Terpène',
  ingredientIsolate: 'Isolat CBN/CBG (comble le reste)',
  ingredientDistThc: 'Distillat THC',
  sanityThc: 'THC résultant (vérification)',
  sanityCbd: 'CBD résultant (vérification)',
  sanityCbdAssumed: 'CBD résultant (assumé ~0%)',
  sanityTotalCost: 'Coût total des matières',
  sanityCostPerG: 'Coût / gramme, produit fini',
  econCardTitleSqdc: 'Économie — nouvelle méthode vs méthode actuelle',
  econCardTitleDom: 'Économie',
  econNewMethod: 'Nouvelle méthode (formulation)',
  econCurrentMethod: 'Méthode actuelle (référence)',
  econRevenue: 'Revenu',
  econMaterialsCost: 'Coût des matières',
  econGrossProfit: 'Profit brut',
  econGrossMargin: 'Marge brute',
  econAllInCost: 'Coût tout compris',
  deltaLabel: 'Nouvelle méthode vs actuelle :',
  deltaCheaper: 'moins cher',
  deltaMoreExpensive: 'plus cher',
  deltaMoreProfit: 'de profit en plus',
  deltaLessProfit: 'de profit en moins',
  deltaOnBatch: 'sur ce lot',
  scenarioCardTitle:
    'Comparaison de scénarios — incertitude des puissances (kief 33–34 %, distillat 83–86 %)',
  scenarioHint:
    "Chaque scénario place le kief au cap THC et le distillat au niveau de remplissage CBD ci-dessus ; l'isolat comble le reste. Coûts, prix de vente, cibles et lot proviennent des sections ci-dessus.",
  scenarioColScenario: 'Scénario',
  scenarioColKief: 'Kief',
  scenarioColDistillat: 'Distillat',
  scenarioColIsolat: 'Isolat',
  scenarioColCostPerG: 'Coût/g',
  scenarioColBatchCost: 'Coût du lot',
  scenarioColProfit: 'Profit',
  scenarioColMargin: 'Marge',
  scenarioConservative: 'Conservateur (pire cas) — kief 34%, dist 83%',
  scenarioNominal: 'Nominal — kief 33.5%, dist 84.5%',
  scenarioFavorable: 'Favorable — kief 33%, dist 86%',
  scenarioTerpSuffix: ' + 1% terpène',
  benchmarkRowLabel: 'Méthode actuelle (référence, trim → kief)',
  domInfeasible:
    '⚠ INFAISABLE — la cible THC doit se situer entre la puissance du kief et celle du distillat (kief &lt; cible &lt; distillat).',
  domCapExceeded: '⚠ Dépasse le cap de {cap} THC — augmentez le cap ou baissez la cible THC.',
  enterSellPrice: 'Entrez un prix de vente ci-dessus',
  batchCompareCardTitle: 'Comparaison 8 kg vs 10 kg',
  batchCompareHint: 'Même ratio de recette à la cible THC ci-dessus, simplement mis à l\'échelle.',
  batchCol8kg: 'Lot de 8 kg',
  batchCol10kg: 'Lot de 10 kg',
  rowKiefG: 'Kief (g)',
  rowDistThcG: 'Distillat THC (g)',
  rowCostPerG: 'Coût / gramme',
} as const;

export type FormulationHashDict = typeof frFormulationHash;

export const enFormulationHash: Partial<Record<keyof FormulationHashDict, string>> = {
  pageTitleTag: 'Hash Formulation Calculator',
  backLink: '← Back to calculators',
  pageTitle: 'Hash Formulation',
  pageIntro: 'Based on the "Oaziz Hash Formulation Calculator" model.',

  tabSqdc: 'SQDC — dilution',
  tabDom: 'DOM — boost',

  sqdcIntro:
    'Kief (33–34% THC) already exceeds the SQDC cap — CBD distillate, isolate, and terpene dilute it ' +
    'down. Enter the actual (COA) potencies for this lot; the recipe recalculates to meet targets with ' +
    'as little isolate/terpene as possible.',
  cardRawMaterials: 'Raw material costs &amp; potencies',
  kiefCostLabel: 'Kief cost ($/g)',
  kiefThcLabel: 'Kief THC potency, this lot — COA (%)',
  distCostCbdLabel: 'CBD distillate cost ($/g)',
  distCbdLabel: 'Distillate CBD potency, this lot — COA (%)',
  isolateCostLabel: 'CBN/CBG isolate cost ($/g)',
  terpCostLabel: 'Terpene cost ($/mL)',
  terpDensityLabel: 'Terpene density (g/mL)',
  densityHint:
    '⚠ Estimated density — confirm with the supplier, it is the biggest cost swing factor when a terpene is used.',
  cardTargetsCompliance: 'Compliance targets',
  maxThcLabel: 'Max allowed THC, finished product (%)',
  maxCbdLabel: 'Max allowed CBD, finished product — cap (%)',
  cbdFillLevelLabel: 'Target CBD fill level (%)',
  terpFractionLabel: 'Terpene fraction to use (% of batch)',
  fillLevelHint:
    'Set the CBD fill level = the cap to minimize isolate cost; lower it for a safety margin.',
  cardBatchPrice: 'Batch &amp; pricing',
  batchKgLabel: 'Batch size (kg)',
  sellPriceLabel: 'Sell price ($/g, finished product)',
  currentCostLabel: 'Current all-in cost ($/g) — trim → kief method, reference',

  domIntro:
    'A <strong>boost</strong> blend, not dilution: kief (33–34% THC) is below target, so THC distillate ' +
    '(much more potent) is added to raise the average — the opposite of SQDC hash.',
  distCostThcLabel: 'THC distillate cost ($/g)',
  distThcLabel: 'Distillate THC potency, this lot — COA (%)',
  cardSpecCompliance: 'Compliance targets / specification',
  domThcTargetLabel: 'Design target THC (%)',
  domMaxThcLabel: 'Max allowed THC, finished product — cap (%)',
  domHintLowerTarget:
    'A lower target = more kief (cheap), less distillate (expensive) = lower cost.',
  domHintCbdCap:
    'Max allowed CBD, finished product — cap: 10%. Always met: neither kief nor THC distillate carry significant CBD.',
  domSellPriceLabel: 'Sell price ($/g, finished product) — optional',

  batchSizeWarning: 'Batch size must be greater than 0.',
  feasibleOk: '✓ Feasible recipe',
  sqdcInfeasible:
    '⚠ INFEASIBLE — the isolate fraction is negative. Kief + distillate + terpene already exceed 100% on their own; raise the THC cap, lower the CBD fill level, or reduce the terpene.',
  cbdCapExceeded:
    '⚠ The target CBD fill level ({fill}) exceeds the allowed cap ({cap}) — non-compliant.',
  recipeCardTitle: 'Recipe (cost-minimizing)',
  ingredientKief: 'Kief',
  ingredientDistCbd: 'CBD Distillate',
  ingredientTerp: 'Terpene',
  ingredientIsolate: 'CBN/CBG Isolate (fills the rest)',
  ingredientDistThc: 'THC Distillate',
  sanityThc: 'Resulting THC (sanity check)',
  sanityCbd: 'Resulting CBD (sanity check)',
  sanityCbdAssumed: 'Resulting CBD (assumed ~0%)',
  sanityTotalCost: 'Total materials cost',
  sanityCostPerG: 'Cost / gram, finished product',
  econCardTitleSqdc: 'Economics — new method vs current method',
  econCardTitleDom: 'Economics',
  econNewMethod: 'New method (formulation)',
  econCurrentMethod: 'Current method (reference)',
  econRevenue: 'Revenue',
  econMaterialsCost: 'Materials cost',
  econGrossProfit: 'Gross profit',
  econGrossMargin: 'Gross margin',
  econAllInCost: 'All-in cost',
  deltaLabel: 'New method vs current:',
  deltaCheaper: 'cheaper',
  deltaMoreExpensive: 'more expensive',
  deltaMoreProfit: 'more profit',
  deltaLessProfit: 'less profit',
  deltaOnBatch: 'on this batch',
  scenarioCardTitle: 'Scenario comparison — potency uncertainty (kief 33–34%, distillate 83–86%)',
  scenarioHint:
    "Each scenario places kief at the THC cap and distillate at the CBD fill level above; isolate fills the rest. Costs, sell price, targets, and batch come from the sections above.",
  scenarioColScenario: 'Scenario',
  scenarioColKief: 'Kief',
  scenarioColDistillat: 'Distillate',
  scenarioColIsolat: 'Isolate',
  scenarioColCostPerG: 'Cost/g',
  scenarioColBatchCost: 'Batch cost',
  scenarioColProfit: 'Profit',
  scenarioColMargin: 'Margin',
  scenarioConservative: 'Conservative (worst case) — kief 34%, dist 83%',
  scenarioNominal: 'Nominal — kief 33.5%, dist 84.5%',
  scenarioFavorable: 'Favorable — kief 33%, dist 86%',
  scenarioTerpSuffix: ' + 1% terpene',
  benchmarkRowLabel: 'Current method (reference, trim → kief)',
  domInfeasible:
    '⚠ INFEASIBLE — the THC target must fall between the kief potency and the distillate potency (kief &lt; target &lt; distillate).',
  domCapExceeded: '⚠ Exceeds the {cap} THC cap — raise the cap or lower the THC target.',
  enterSellPrice: 'Enter a sell price above',
  batchCompareCardTitle: 'Comparison — 8 kg vs 10 kg',
  batchCompareHint: 'Same recipe ratio at the THC target above, simply scaled.',
  batchCol8kg: '8 kg batch',
  batchCol10kg: '10 kg batch',
  rowKiefG: 'Kief (g)',
  rowDistThcG: 'THC Distillate (g)',
  rowCostPerG: 'Cost / gram',
};
