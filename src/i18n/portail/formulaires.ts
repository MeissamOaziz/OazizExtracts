export const frFormulaires = {
  title: 'Formulaires R&D',
  backLink: "← Retour à l'accueil",
  subtitle: "Suivi de vos demandes d'échantillon.",
  newRequest: '+ Nouvelle demande',

  emptyState: 'Aucune demande pour le moment.',
  emptyStateBtn: 'Créer la première',

  'th.date': 'Date',
  'th.product': 'Produit',
  'th.participants': 'Participants',
  'th.signatures': 'Signatures',
  'th.status': 'Statut',
  'th.document': 'Document',

  unnamedProduct: '(sans nom)',

  downloadPdfTitle: 'Télécharger le PDF',
  downloadPdfText: '⬇ PDF',

  signBtn: 'Signer',
  openLink: 'Ouvrir →',
} as const;

export type FormulairesDict = typeof frFormulaires;

export const enFormulaires: Partial<Record<keyof FormulairesDict, string>> = {
  title: 'R&D Forms',
  backLink: '← Back to home',
  subtitle: 'Track your sample requests.',
  newRequest: '+ New request',

  emptyState: 'No requests yet.',
  emptyStateBtn: 'Create the first one',

  'th.date': 'Date',
  'th.product': 'Product',
  'th.participants': 'Participants',
  'th.signatures': 'Signatures',
  'th.status': 'Status',
  'th.document': 'Document',

  unnamedProduct: '(unnamed)',

  downloadPdfTitle: 'Download the PDF',
  downloadPdfText: '⬇ PDF',

  signBtn: 'Sign',
  openLink: 'Open →',
};
