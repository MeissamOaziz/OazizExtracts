export const frFournisseursIndex = {
  title: 'VQ & licences Oaziz',
  backLink: '← Accueil',
  subtitle: 'Dossiers de qualification fournisseur et suivi des approbations.',

  'invite.heading': 'Inviter un nouveau fournisseur',
  'invite.desc': "Envoie un courriel avec le lien du formulaire de qualification, ainsi que nos licences CRA et Santé Canada en pièces jointes. Plusieurs personnes chez le même fournisseur reçoivent un seul lien et remplissent le même formulaire.",
  'invite.emailLabel': 'Courriel(s) du fournisseur',
  'invite.emailHint': 'Séparez plusieurs adresses par une virgule ou un point-virgule (10 au maximum).',
  'invite.sendBtn': 'Envoyer le questionnaire',
  manageLicensesBtn: 'Gérer nos licences',

  'info.invite_sent': 'Invitation envoyée.',
  'info.reminder_sent': 'Rappel envoyé.',
  'error.invite_email_invalid': 'Veuillez entrer des adresses courriel valides.',
  'error.invite_email_invalid_list': 'Ces adresses ne sont pas valides :',
  'error.invite_too_many': 'Dix destinataires au maximum par invitation.',
  'error.invite_send_failed': "L'envoi de l'invitation a échoué. Réessayez.",
  'error.unknown': 'Une erreur est survenue.',

  'invites.heading': 'Invitations envoyées',
  'invites.hint': 'Suivi des invitations envoyées — relancez un fournisseur qui a laissé son dossier en plan.',
  'invites.empty': 'Aucune invitation envoyée pour le moment.',
  'invites.th.sentAt': 'Envoyée le',
  'invites.th.email': 'Destinataires',
  'invites.th.status': 'Statut',
  'invites.th.lastReminder': 'Dernier rappel',
  'invites.status.not_started': 'Pas commencé',
  'invites.status.in_progress': 'En cours',
  'invites.status.submitted': 'Soumis — en approbation',
  'invites.status.completed': 'Complété',
  'invites.remindBtn': 'Relancer',
  'invites.never': 'Jamais',

  emptyState: 'Aucun dossier fournisseur pour le moment.',

  'th.date': 'Reçu le',
  'th.company': 'Entreprise',
  'th.contact': 'Personne-ressource',
  'th.approvals': 'Approbations',
  'th.status': 'Statut',

  'status.approved': 'Approuvé',
  'status.pending': 'En attente',
  'status.feedback': 'En attente de feedback',
  'status.rejected': 'Rejeté',

  openLink: 'Ouvrir →',
} as const;

export type FournisseursIndexDict = typeof frFournisseursIndex;

export const enFournisseursIndex: Partial<Record<keyof FournisseursIndexDict, string>> = {
  title: 'VQ & Oaziz Licenses',
  backLink: '← Home',
  subtitle: 'Vendor qualification files and approval tracking.',

  'invite.heading': 'Invite a new vendor',
  'invite.desc': "Sends an email with the qualification form link, plus our CRA and Health Canada licenses attached. Several people at the same vendor get one link and fill in the same form.",
  'invite.emailLabel': "Vendor's email(s)",
  'invite.emailHint': 'Separate several addresses with a comma or semicolon (up to 10).',
  'invite.sendBtn': 'Send questionnaire',
  manageLicensesBtn: 'Manage our licenses',

  'info.invite_sent': 'Invitation sent.',
  'info.reminder_sent': 'Reminder sent.',
  'error.invite_email_invalid': 'Please enter valid email addresses.',
  'error.invite_email_invalid_list': 'These addresses are not valid:',
  'error.invite_too_many': 'Up to ten recipients per invitation.',
  'error.invite_send_failed': 'Sending the invitation failed. Try again.',
  'error.unknown': 'An error occurred.',

  'invites.heading': 'Invitations sent',
  'invites.hint': 'Track invitations you have sent — nudge a vendor who left their file unfinished.',
  'invites.empty': 'No invitations sent yet.',
  'invites.th.sentAt': 'Sent on',
  'invites.th.email': 'Recipients',
  'invites.th.status': 'Status',
  'invites.th.lastReminder': 'Last reminder',
  'invites.status.not_started': 'Not started',
  'invites.status.in_progress': 'In progress',
  'invites.status.submitted': 'Submitted — pending approval',
  'invites.status.completed': 'Completed',
  'invites.remindBtn': 'Remind',
  'invites.never': 'Never',

  emptyState: 'No vendor files yet.',

  'th.date': 'Received on',
  'th.company': 'Company',
  'th.contact': 'Contact',
  'th.approvals': 'Approvals',
  'th.status': 'Status',

  'status.approved': 'Approved',
  'status.pending': 'Pending',
  'status.feedback': 'Awaiting feedback',
  'status.rejected': 'Rejected',

  openLink: 'Open →',
};
