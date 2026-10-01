export const frRhAttestation = {
  title: "Attestation d'emploi",
  backLink: '← Ressources humaines',
  subtitle: 'Remplissez les champs ci-dessous pour générer le PDF.',

  'label.employeeName': "Nom complet de l'employé(e)",
  'label.startDate': "Date de début d'emploi",
  'label.issueDate': 'Date de délivrance',
  'label.recipients': 'Envoyer une copie par courriel (optionnel)',
  'hint.recipients': 'Courriels séparés par des virgules.',

  generateBtn: 'Générer le PDF',
  'error.missing': 'Veuillez remplir le nom et la date de début.',
  'error.unknown': 'Une erreur est survenue.',
  'info.generated': 'Document généré.',
  downloadBtn: 'Télécharger le PDF',
} as const;

export type RhAttestationDict = typeof frRhAttestation;

export const enRhAttestation: Partial<Record<keyof RhAttestationDict, string>> = {
  title: 'Work Attestation',
  backLink: '← Human Resources',
  subtitle: 'Fill in the fields below to generate the PDF.',

  'label.employeeName': "Employee's full name",
  'label.startDate': 'Employment start date',
  'label.issueDate': 'Issue date',
  'label.recipients': 'Email a copy (optional)',
  'hint.recipients': 'Comma-separated emails.',

  generateBtn: 'Generate PDF',
  'error.missing': 'Please fill in the name and start date.',
  'error.unknown': 'An error occurred.',
  'info.generated': 'Document generated.',
  downloadBtn: 'Download PDF',
};
