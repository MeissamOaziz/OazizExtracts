export const frHub = {
  title: 'Accueil',
  greeting: 'Bonjour, {name}.',
  subtitle: 'Choisissez une section.',

  'section.forms.desc': "Demandes d'échantillon, consentement, signatures et documents.",
  'section.forms.tag': '{count} en cours',

  'section.calc.desc': 'Coût de production, prix de vente par palier de marge, solveur inverse.',
} as const;

export type HubDict = typeof frHub;

export const enHub: Partial<Record<keyof HubDict, string>> = {
  title: 'Home',
  greeting: 'Hello, {name}.',
  subtitle: 'Choose a section.',

  'section.forms.desc': 'Sample requests, consent, signatures, and documents.',
  'section.forms.tag': '{count} in progress',

  'section.calc.desc': 'Production cost, margin-tiered selling price, reverse solver.',
};
