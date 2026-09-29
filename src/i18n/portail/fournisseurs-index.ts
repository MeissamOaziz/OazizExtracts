export const frFournisseursIndex = {
  title: 'Fournisseurs',
  backLink: '← Accueil',
  subtitle: 'Dossiers de qualification fournisseur et suivi des approbations.',

  emptyState: 'Aucun dossier fournisseur pour le moment.',

  'th.date': 'Reçu le',
  'th.company': 'Entreprise',
  'th.contact': 'Personne-ressource',
  'th.approvals': 'Approbations',
  'th.status': 'Statut',

  'status.approved': 'Approuvé',
  'status.pending': 'En attente',

  openLink: 'Ouvrir →',
} as const;

export type FournisseursIndexDict = typeof frFournisseursIndex;

export const enFournisseursIndex: Partial<Record<keyof FournisseursIndexDict, string>> = {
  title: 'Vendors',
  backLink: '← Home',
  subtitle: 'Vendor qualification files and approval tracking.',

  emptyState: 'No vendor files yet.',

  'th.date': 'Received on',
  'th.company': 'Company',
  'th.contact': 'Contact',
  'th.approvals': 'Approvals',
  'th.status': 'Status',

  'status.approved': 'Approved',
  'status.pending': 'Pending',

  openLink: 'Open →',
};
