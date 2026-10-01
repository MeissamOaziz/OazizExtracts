export const frRhIncident = {
  title: "Rapport d'incident",
  backLink: '← Ressources humaines',
  subtitle: 'Remplissez les champs ci-dessous pour générer le PDF.',

  'label.documentLanguage': 'Langue du document',
  'lang.fr': 'Français', 'lang.en': 'English',

  'section.employeeInfo': "Informations sur l'employé",
  'label.employeeName': 'Nom complet',
  'label.jobTitle': 'Titre du poste',
  'label.incidentDate': "Date de l'incident",
  'label.incidentTime': "Heure de l'incident",

  'section.incidentDetails': "Détails de l'incident",
  'label.incidentLocation': "Lieu de l'incident",
  'label.incidentDescription': 'Description',

  'section.injuryDetails': 'Détails de la blessure',
  'label.injuryType': 'Type de blessure',
  'label.bodyPart': 'Partie du corps touchée',
  'label.treatmentProvided': 'Traitement fourni sur place (si applicable)',

  'section.witnesses': 'Témoins et signatures',
  'hint.signatures': 'Noms tapés — à faire contresigner sur la copie imprimée si requis.',
  'label.witnessName': 'Nom du témoin',
  'label.witnessSignature': 'Signature du témoin (nom tapé)',
  'label.employeeSignature': "Signature de l'employé (nom tapé)",
  'label.supervisorSignature': 'Signature du superviseur/gérant (nom tapé)',

  'label.recipients': 'Envoyer une copie par courriel (optionnel)',
  'hint.recipients': 'Courriels séparés par des virgules.',

  generateBtn: 'Générer le PDF',
  'error.missing': 'Veuillez remplir le nom et la date.',
  'error.unknown': 'Une erreur est survenue.',
  'info.generated': 'Document généré.',
  downloadBtn: 'Télécharger le PDF',
} as const;

export type RhIncidentDict = typeof frRhIncident;

export const enRhIncident: Partial<Record<keyof RhIncidentDict, string>> = {
  title: 'Incident Report',
  backLink: '← Human Resources',
  subtitle: 'Fill in the fields below to generate the PDF.',

  'label.documentLanguage': 'Document language',
  'lang.fr': 'Français', 'lang.en': 'English',

  'section.employeeInfo': 'Employee Information',
  'label.employeeName': 'Full Name',
  'label.jobTitle': 'Job Title',
  'label.incidentDate': 'Date of Incident',
  'label.incidentTime': 'Time of Incident',

  'section.incidentDetails': 'Incident Details',
  'label.incidentLocation': 'Location of Incident',
  'label.incidentDescription': 'Description',

  'section.injuryDetails': 'Injury Details',
  'label.injuryType': 'Type of Injury',
  'label.bodyPart': 'Body Part Affected',
  'label.treatmentProvided': 'Treatment provided on site (if any)',

  'section.witnesses': 'Witnesses & Signatures',
  'hint.signatures': 'Typed names — have the printed copy countersigned if required.',
  'label.witnessName': 'Witness Name',
  'label.witnessSignature': 'Witness Signature (typed name)',
  'label.employeeSignature': 'Employee Signature (typed name)',
  'label.supervisorSignature': 'Supervisor/Manager Signature (typed name)',

  'label.recipients': 'Email a copy (optional)',
  'hint.recipients': 'Comma-separated emails.',

  generateBtn: 'Generate PDF',
  'error.missing': 'Please fill in the name and date.',
  'error.unknown': 'An error occurred.',
  'info.generated': 'Document generated.',
  downloadBtn: 'Download PDF',
};
