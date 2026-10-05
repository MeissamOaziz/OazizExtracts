export const frHub = {
  title: 'Accueil',
  greeting: 'Bonjour, {name}.',
  subtitle: 'Choisissez une section.',

  'section.forms.desc': "Demandes d'échantillon, consentement, signatures et documents.",
  'section.forms.tag': '{count} en cours',

  'section.calc.desc': 'Coût de production, prix de vente par palier de marge, solveur inverse.',

  'section.vendors.desc': "Qualification des fournisseurs, approbations individuelles et licences d'Oaziz.",
  'section.vendors.tag': '{count} à approuver',

  'section.hr.desc': "Attestations, rapports d'incident, évaluations et dossiers de nouveaux employés.",
  'section.hr.tag': '{count} en attente',

  'section.admin.desc': "Gérer les utilisateurs du portail et leurs accès par module.",
  'error.forbidden': "Vous n'avez pas accès à cette section. Contactez un administrateur si c'est une erreur.",
  noAccess: "Aucun module ne vous est assigné pour le moment. Contactez un administrateur du portail.",
} as const;

export type HubDict = typeof frHub;

export const enHub: Partial<Record<keyof HubDict, string>> = {
  title: 'Home',
  greeting: 'Hello, {name}.',
  subtitle: 'Choose a section.',

  'section.forms.desc': 'Sample requests, consent, signatures, and documents.',
  'section.forms.tag': '{count} in progress',

  'section.calc.desc': 'Production cost, margin-tiered selling price, reverse solver.',

  'section.vendors.desc': "Vendor qualification, individual approvals and Oaziz's own licenses.",
  'section.vendors.tag': '{count} to approve',

  'section.hr.desc': 'Work attestations, incident reports, evaluations and new employee files.',
  'section.hr.tag': '{count} pending',

  'section.admin.desc': 'Manage portal users and their access by module.',
  'error.forbidden': "You don't have access to that section. Contact an administrator if this is a mistake.",
  noAccess: 'No modules are assigned to you yet. Contact a portal administrator.',
};
