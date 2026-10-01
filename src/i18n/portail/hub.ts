export const frHub = {
  title: 'Accueil',
  greeting: 'Bonjour, {name}.',
  subtitle: 'Choisissez une section.',

  'section.forms.desc': "Demandes d'échantillon, consentement, signatures et documents.",
  'section.forms.tag': '{count} en cours',

  'section.calc.desc': 'Coût de production, prix de vente par palier de marge, solveur inverse.',

  'section.vendors.desc': "Dossiers de qualification fournisseur et suivi des approbations individuelles.",
  'section.vendors.tag': '{count} à approuver',

  'section.hr.desc': "Attestations, rapports d'incident, évaluations et dossiers de nouveaux employés.",
  'section.hr.tag': '{count} en attente',
} as const;

export type HubDict = typeof frHub;

export const enHub: Partial<Record<keyof HubDict, string>> = {
  title: 'Home',
  greeting: 'Hello, {name}.',
  subtitle: 'Choose a section.',

  'section.forms.desc': 'Sample requests, consent, signatures, and documents.',
  'section.forms.tag': '{count} in progress',

  'section.calc.desc': 'Production cost, margin-tiered selling price, reverse solver.',

  'section.vendors.desc': 'Vendor qualification files and individual approval tracking.',
  'section.vendors.tag': '{count} to approve',

  'section.hr.desc': 'Work attestations, incident reports, evaluations and new employee files.',
  'section.hr.tag': '{count} pending',
};
