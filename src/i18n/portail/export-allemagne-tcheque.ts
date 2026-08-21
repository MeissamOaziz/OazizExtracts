export const frExportAllemagneTcheque = {
  pageTitle: 'Export Allemagne (via République tchèque)',
  backLink: '← Retour aux calculatrices',
  heading: 'Export Allemagne (via République tchèque)',
  intro:
    'Fournisseur → GWNG (Canada) → République tchèque (transformation GACP → GMP) → Distribution allemande → Pharmacies. Basé sur « Christian Q&A Email + GWNG Confirmed Costs ».',

  'currency.heading': 'Devises',
  'currency.fxRate': 'Taux de conversion CAD → EUR',
  'currency.fxHint': 'Le taux inverse (EUR → CAD) est calculé automatiquement.',

  'volume.heading': 'Volume',
  'volume.shipmentVolume': 'Volume par envoi (g)',
  'volume.bagSize': 'Taille du sac (g/sac)',
  'volume.numStrains': 'Nombre de souches',

  'upstream.heading': 'Coûts en amont (CAD) — Fournisseur → GWNG → Rép. tchèque',
  'upstream.flowerCost': "Coût d'achat de la fleur (CA$/g)",
  'upstream.shippingSupplierToGwng': 'Expédition fournisseur → GWNG, tarif forfaitaire / 25 kg (CA$)',
  'upstream.gwngHandling': 'Frais de manutention GWNG (CA$/g)',
  'upstream.shippingGwngToCzech': 'Expédition GWNG → Rép. tchèque (CA$/g)',

  'setup.heading': 'Coûts uniques (EUR)',
  'setup.growerRegistry': 'Registre par cultivateur (Allemagne) (€)',
  'setup.productRegistration': "Frais d'enregistrement du produit (Allemagne) (€)",
  'setup.germanSetupFee': 'Frais de mise en place entrepreneur allemand — 1er mois (€)',
  'setup.hint': 'Onboarding fournisseur confirmé à 0 € — non inclus. Total informatif, non amorti par envoi.',

  'processing.heading': 'Coûts de transformation par gramme (EUR) — République tchèque',
  'processing.retentionSample': 'Échantillon de rétention par souche (g)',
  'processing.gacpToGmp': 'Transformation GACP → GMP, en sacs de 150g (€/g)',
  'processing.remediationSurcharge': 'Supplément de remédiation, si nécessaire (€/g)',
  'processing.salesCommission': 'Commission de vente, payée à la vente en pharmacie (€/g)',
  'processing.includeRemediation': 'Inclure la remédiation',
  'processing.hint': 'Transport Rép. tchèque → Allemagne et entreposage confirmés à 0 € — non inclus.',

  'monthly.heading': 'Coûts fixes mensuels (EUR) — Allemagne',
  'monthly.entrepreneurFee': 'Frais entrepreneur / représentant réglementaire allemand (€/mois)',
  'monthly.shipmentsPerMonth': 'Envois par mois',
  'monthly.pharmacyDeliveryFee': 'Frais de livraison en pharmacie (€/g expédié)',

  'price.heading': 'Prix de vente',
  'price.markup': 'Majoration Oaziz (%)',

  // ---- Result panel (client-side, via JSON data island) ----
  'result.volumeWarning': 'Le volume par envoi doit être supérieur à 0.',

  'result.headline.heading': 'Prix de vente suggéré aux pharmacies',
  'result.headline.hint':
    'Scénario principal : avec commission de vente, sans remédiation — coût total + majoration Oaziz de {pct}.',
  'result.headline.totalCostLabel': 'Coût total par envoi',
  'result.headline.sellPriceTotalLabel': 'Prix de vente suggéré (total)',
  'result.headline.sellPricePerGramLabel': 'Prix de vente suggéré ($/g)',
  'result.headline.profitLabel': 'Profit brut par envoi',
  'result.headline.volumeSub': 'Sur {volume} ({bags} sacs de {bagSize})',

  'result.upstream.heading': 'Coûts en amont (CAD) — Fournisseur → GWNG → Rép. tchèque',
  'result.upstream.flower': 'Achat de la fleur',
  'result.upstream.shippingToGwng': 'Expédition fournisseur → GWNG',
  'result.upstream.gwngHandling': 'Manutention GWNG',
  'result.upstream.shippingToCzech': 'Expédition GWNG → Rép. tchèque',
  'result.upstream.total': 'Total en amont',

  'result.setup.heading': 'Coûts uniques (EUR) — informationnel, non amorti par envoi',
  'result.setup.growerRegistry': 'Registre par cultivateur (Allemagne)',
  'result.setup.productRegistration': "Frais d'enregistrement du produit",
  'result.setup.germanSetupFee': 'Mise en place entrepreneur allemand (1er mois)',
  'result.setup.total': 'Total coûts uniques',

  'result.processing.heading': 'Transformation (EUR) — République tchèque',
  'result.processing.retentionSample': 'Échantillon de rétention ({retained} retenus, {saleable} vendables)',
  'result.processing.retentionSampleSuffix': '(perte de valeur fleur, CAD)',
  'result.processing.gacpToGmp': 'Transformation GACP → GMP',
  'result.processing.salesCommission': 'Commission de vente (sur volume vendable)',
  'result.processing.remediationLabel': 'Supplément de remédiation {status}',
  'result.processing.remediationIncluded': '(inclus)',
  'result.processing.remediationNotIncluded': '(non inclus)',

  'result.monthly.heading': 'Coûts fixes (EUR) — Allemagne',
  'result.monthly.entrepreneurLabel': 'Entrepreneur / représentant réglementaire, par envoi ({n} envoi(s)/mois)',
  'result.monthly.pharmacyDelivery': 'Livraison en pharmacie',

  'result.summary.heading': 'Résumé — coût total par envoi selon scénario',
  'result.summary.hint': '★ = scénario principal utilisé pour le prix de vente suggéré ci-dessus.',
  'result.summary.thScenario': 'Scénario',
  'result.summary.thTotalCad': 'Coût total (CAD)',

  'result.scenario.withCommissionNoRemediation': 'Avec commission, sans remédiation',
  'result.scenario.noCommissionNoRemediation': 'Sans commission, sans remédiation',
  'result.scenario.withCommissionWithRemediation': 'Avec commission, avec remédiation',
  'result.scenario.noCommissionWithRemediation': 'Sans commission, avec remédiation',

  'result.details.summary': 'Détail du calcul retenu (avec commission, activé selon la case « remédiation » ci-dessus)',
  'result.details.withCommission': 'Coût total, avec commission',
  'result.details.withoutCommission': 'Coût total, sans commission',
} as const;

export type ExportAllemagneTchequeDict = typeof frExportAllemagneTcheque;

export const enExportAllemagneTcheque: Partial<Record<keyof ExportAllemagneTchequeDict, string>> = {
  pageTitle: 'Germany export (via Czech Republic)',
  backLink: '← Back to calculators',
  heading: 'Germany export (via Czech Republic)',
  intro:
    'Supplier → GWNG (Canada) → Czech Republic (GACP → GMP processing) → German distribution → Pharmacies. Based on "Christian Q&A Email + GWNG Confirmed Costs".',

  'currency.heading': 'Currencies',
  'currency.fxRate': 'CAD → EUR conversion rate',
  'currency.fxHint': 'The inverse rate (EUR → CAD) is calculated automatically.',

  'volume.heading': 'Volume',
  'volume.shipmentVolume': 'Volume per shipment (g)',
  'volume.bagSize': 'Bag size (g/bag)',
  'volume.numStrains': 'Number of strains',

  'upstream.heading': 'Upstream costs (CAD) — Supplier → GWNG → Czech Rep.',
  'upstream.flowerCost': 'Flower purchase cost (CA$/g)',
  'upstream.shippingSupplierToGwng': 'Supplier → GWNG shipping, flat rate / 25 kg (CA$)',
  'upstream.gwngHandling': 'GWNG handling fee (CA$/g)',
  'upstream.shippingGwngToCzech': 'GWNG → Czech Rep. shipping (CA$/g)',

  'setup.heading': 'One-time setup costs (EUR)',
  'setup.growerRegistry': 'Grower registry (Germany) (€)',
  'setup.productRegistration': 'Product registration fee (Germany) (€)',
  'setup.germanSetupFee': 'German entrepreneur setup fee — 1st month (€)',
  'setup.hint': 'Supplier onboarding confirmed at €0 — not included. Informational total, not amortized per shipment.',

  'processing.heading': 'Per-gram processing costs (EUR) — Czech Republic',
  'processing.retentionSample': 'Retention sample per strain (g)',
  'processing.gacpToGmp': 'GACP → GMP processing, in 150g bags (€/g)',
  'processing.remediationSurcharge': 'Remediation surcharge, if needed (€/g)',
  'processing.salesCommission': 'Sales commission, paid on sale to pharmacy (€/g)',
  'processing.includeRemediation': 'Include remediation',
  'processing.hint': 'Czech Rep. → Germany transport and storage confirmed at €0 — not included.',

  'monthly.heading': 'Fixed monthly costs (EUR) — Germany',
  'monthly.entrepreneurFee': 'German entrepreneur / regulatory representative fee (€/month)',
  'monthly.shipmentsPerMonth': 'Shipments per month',
  'monthly.pharmacyDeliveryFee': 'Pharmacy delivery fee (€/g shipped)',

  'price.heading': 'Selling price',
  'price.markup': 'Oaziz markup (%)',

  'result.volumeWarning': 'Volume per shipment must be greater than 0.',

  'result.headline.heading': 'Suggested selling price to pharmacies',
  'result.headline.hint':
    'Primary scenario: with sales commission, no remediation — total cost + Oaziz markup of {pct}.',
  'result.headline.totalCostLabel': 'Total cost per shipment',
  'result.headline.sellPriceTotalLabel': 'Suggested selling price (total)',
  'result.headline.sellPricePerGramLabel': 'Suggested selling price ($/g)',
  'result.headline.profitLabel': 'Gross profit per shipment',
  'result.headline.volumeSub': 'On {volume} ({bags} bags of {bagSize})',

  'result.upstream.heading': 'Upstream costs (CAD) — Supplier → GWNG → Czech Rep.',
  'result.upstream.flower': 'Flower purchase',
  'result.upstream.shippingToGwng': 'Supplier → GWNG shipping',
  'result.upstream.gwngHandling': 'GWNG handling',
  'result.upstream.shippingToCzech': 'GWNG → Czech Rep. shipping',
  'result.upstream.total': 'Total upstream',

  'result.setup.heading': 'One-time costs (EUR) — informational, not amortized per shipment',
  'result.setup.growerRegistry': 'Grower registry (Germany)',
  'result.setup.productRegistration': 'Product registration fee',
  'result.setup.germanSetupFee': 'German entrepreneur setup (1st month)',
  'result.setup.total': 'Total one-time costs',

  'result.processing.heading': 'Processing (EUR) — Czech Republic',
  'result.processing.retentionSample': 'Retention sample ({retained} withheld, {saleable} sellable)',
  'result.processing.retentionSampleSuffix': '(lost flower value, CAD)',
  'result.processing.gacpToGmp': 'GACP → GMP processing',
  'result.processing.salesCommission': 'Sales commission (on sellable volume)',
  'result.processing.remediationLabel': 'Remediation surcharge {status}',
  'result.processing.remediationIncluded': '(included)',
  'result.processing.remediationNotIncluded': '(not included)',

  'result.monthly.heading': 'Fixed costs (EUR) — Germany',
  'result.monthly.entrepreneurLabel': 'Entrepreneur / regulatory representative, per shipment ({n} shipment(s)/month)',
  'result.monthly.pharmacyDelivery': 'Pharmacy delivery',

  'result.summary.heading': 'Summary — total cost per shipment by scenario',
  'result.summary.hint': '★ = primary scenario used for the suggested selling price above.',
  'result.summary.thScenario': 'Scenario',
  'result.summary.thTotalCad': 'Total cost (CAD)',

  'result.scenario.withCommissionNoRemediation': 'With commission, no remediation',
  'result.scenario.noCommissionNoRemediation': 'Without commission, no remediation',
  'result.scenario.withCommissionWithRemediation': 'With commission, with remediation',
  'result.scenario.noCommissionWithRemediation': 'Without commission, with remediation',

  'result.details.summary': 'Detail of the calculation used (with commission, toggled per the "remediation" checkbox above)',
  'result.details.withCommission': 'Total cost, with commission',
  'result.details.withoutCommission': 'Total cost, without commission',
};
