export const frRhEmployees = {
  title: 'Dossiers de nouveaux employés',
  backLink: '← Ressources humaines',
  subtitle: "Envoyez le dossier d'accueil à un nouvel employé et suivez sa progression.",

  'section.send': 'Envoyer un nouveau dossier',
  'label.employeeName': "Nom complet de l'employé",
  'label.employeeEmail': "Courriel de l'employé",
  'label.language': 'Langue du dossier',
  'lang.fr': 'Français', 'lang.en': 'English',
  sendBtn: 'Envoyer le dossier',

  'section.list': 'Dossiers envoyés',
  emptyList: 'Aucun dossier envoyé pour le moment.',
  'th.employee': 'Employé', 'th.email': 'Courriel', 'th.language': 'Langue',
  'th.status': 'Statut', 'th.sentAt': 'Envoyé le', 'th.actions': '',

  'status.sent': "En attente de l'employé",
  'status.awaiting_witness': 'En attente de contresignature',
  'status.completed': 'Complété',

  viewBtn: 'Voir',

  'info.sent': 'Dossier envoyé avec succès.',
  'error.invalid_email': 'Courriel invalide.',
  'error.missing': 'Veuillez remplir le nom et le courriel.',
  'error.send_failed': "Échec de l'envoi du courriel.",
  'error.unknown': 'Une erreur est survenue.',
} as const;

export type RhEmployeesDict = typeof frRhEmployees;

export const enRhEmployees: Partial<Record<keyof RhEmployeesDict, string>> = {
  title: 'New Employee Packages',
  backLink: '← Human Resources',
  subtitle: "Send the onboarding package to a new employee and track its progress.",

  'section.send': 'Send a new package',
  'label.employeeName': "Employee's full name",
  'label.employeeEmail': "Employee's email",
  'label.language': 'Package language',
  'lang.fr': 'Français', 'lang.en': 'English',
  sendBtn: 'Send package',

  'section.list': 'Sent packages',
  emptyList: 'No packages sent yet.',
  'th.employee': 'Employee', 'th.email': 'Email', 'th.language': 'Language',
  'th.status': 'Status', 'th.sentAt': 'Sent on', 'th.actions': '',

  'status.sent': 'Awaiting employee',
  'status.awaiting_witness': 'Awaiting countersignature',
  'status.completed': 'Completed',

  viewBtn: 'View',

  'info.sent': 'Package sent successfully.',
  'error.invalid_email': 'Invalid email.',
  'error.missing': 'Please fill in the name and email.',
  'error.send_failed': 'Failed to send the email.',
  'error.unknown': 'An error occurred.',
};
