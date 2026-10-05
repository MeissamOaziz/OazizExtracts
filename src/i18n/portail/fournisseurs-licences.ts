export const frFournisseursLicences = {
  title: 'Nos licences',
  backLink: '← VQ & licences Oaziz',
  subtitle: "Gérez les licences d'Oaziz Extracts (CRA et Santé Canada) : téléversement, date d'expiration, rappels et envoi rapide.",

  'info.saved': 'Licence mise à jour.',
  'info.sent': 'Licences envoyées.',
  'error.unknown': 'Une erreur est survenue.',
  'error.file_type': 'Le fichier doit être un PDF.',
  'error.file_size': 'Fichier trop volumineux (15 Mo maximum).',
  'error.send_email_invalid': 'Veuillez entrer au moins une adresse courriel valide (séparées par des virgules).',
  'error.send_failed': "L'envoi a échoué. Réessayez.",
  'error.no_files': "Aucune licence n'est téléversée pour le moment.",

  'kind.cra': 'Agence du revenu du Canada (CRA)',
  'kind.health_canada': 'Santé Canada',

  currentFile: 'Fichier actuel',
  noFile: 'Aucun fichier téléversé',
  downloadBtn: 'Télécharger',
  replaceFileLabel: 'Remplacer le fichier (PDF)',
  expiryDateLabel: "Date d'expiration",
  reminderRecipientsLabel: 'Destinataires du rappel (courriels séparés par des virgules)',
  reminderRecipientsHint: 'Un rappel automatique est envoyé 6 mois avant la date d\'expiration.',
  reminderSentNote: 'Rappel déjà envoyé pour cette date.',
  saveBtn: 'Enregistrer',

  'send.heading': 'Envoyer nos licences',
  'send.desc': 'Envoie nos deux licences actuelles (CRA et Santé Canada) en pièces jointes.',
  'send.recipientsLabel': 'Destinataire(s) — courriels séparés par des virgules',
  'send.sendBtn': 'Envoyer',
} as const;

export type FournisseursLicencesDict = typeof frFournisseursLicences;

export const enFournisseursLicences: Partial<Record<keyof FournisseursLicencesDict, string>> = {
  title: 'Our licenses',
  backLink: '← VQ & Oaziz Licenses',
  subtitle: "Manage Oaziz Extracts' licenses (CRA and Health Canada): upload, expiry date, reminders, and quick send.",

  'info.saved': 'License updated.',
  'info.sent': 'Licenses sent.',
  'error.unknown': 'An error occurred.',
  'error.file_type': 'The file must be a PDF.',
  'error.file_size': 'File too large (15 MB maximum).',
  'error.send_email_invalid': 'Please enter at least one valid email address (comma-separated).',
  'error.send_failed': 'Sending failed. Try again.',
  'error.no_files': 'No license has been uploaded yet.',

  'kind.cra': 'Canada Revenue Agency (CRA)',
  'kind.health_canada': 'Health Canada',

  currentFile: 'Current file',
  noFile: 'No file uploaded',
  downloadBtn: 'Download',
  replaceFileLabel: 'Replace file (PDF)',
  expiryDateLabel: 'Expiry date',
  reminderRecipientsLabel: 'Reminder recipients (comma-separated emails)',
  reminderRecipientsHint: 'An automatic reminder is sent 6 months before the expiry date.',
  reminderSentNote: 'Reminder already sent for this date.',
  saveBtn: 'Save',

  'send.heading': 'Send our licenses',
  'send.desc': 'Sends our two current licenses (CRA and Health Canada) as attachments.',
  'send.recipientsLabel': 'Recipient(s) — comma-separated emails',
  'send.sendBtn': 'Send',
};
