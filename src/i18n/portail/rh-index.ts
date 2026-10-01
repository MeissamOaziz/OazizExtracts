export const frRhIndex = {
  title: 'Ressources humaines',
  backLink: '← Accueil',
  subtitle: 'Modèles RH, rapports et dossiers de nouveaux employés.',

  'card.attestation.title': "Attestation d'emploi",
  'card.attestation.desc': 'Remplir, générer en PDF et envoyer par courriel.',
  'card.incident.title': "Rapport d'incident",
  'card.incident.desc': 'Remplir, générer en PDF et envoyer par courriel.',
  'card.evaluation.title': "Évaluation de rendement",
  'card.evaluation.desc': 'Remplir, générer en PDF et envoyer par courriel.',
  'card.employees.title': 'Nouveaux employés',
  'card.employees.desc': "Envoyer le dossier d'accueil, suivre les signatures et les contresignatures.",

  'section.recent': 'Documents générés récemment',
  emptyRecent: 'Aucun document généré pour le moment.',
  'th.date': 'Date',
  'th.kind': 'Type',
  'th.sentTo': 'Envoyé à',
  downloadBtn: 'Télécharger',

  'kind.attestation': "Attestation d'emploi",
  'kind.incident_report': "Rapport d'incident",
  'kind.evaluation': 'Évaluation de rendement',
} as const;

export type RhIndexDict = typeof frRhIndex;

export const enRhIndex: Partial<Record<keyof RhIndexDict, string>> = {
  title: 'Human Resources',
  backLink: '← Home',
  subtitle: 'HR templates, reports and new employee files.',

  'card.attestation.title': 'Work Attestation',
  'card.attestation.desc': 'Fill in, generate a PDF and send by email.',
  'card.incident.title': 'Incident Report',
  'card.incident.desc': 'Fill in, generate a PDF and send by email.',
  'card.evaluation.title': 'Performance Evaluation',
  'card.evaluation.desc': 'Fill in, generate a PDF and send by email.',
  'card.employees.title': 'New Employees',
  'card.employees.desc': 'Send the onboarding package, track signatures and countersigning.',

  'section.recent': 'Recently generated documents',
  emptyRecent: 'No documents generated yet.',
  'th.date': 'Date',
  'th.kind': 'Type',
  'th.sentTo': 'Sent to',
  downloadBtn: 'Download',

  'kind.attestation': 'Work Attestation',
  'kind.incident_report': 'Incident Report',
  'kind.evaluation': 'Performance Evaluation',
};
