export const frRhPackage = {
  pageTitle: "Dossier d'accueil",
  heading: 'Bienvenue chez Oaziz Extracts !',
  intro: "Pour compléter votre dossier d'employé, veuillez remplir le formulaire ci-dessous, prendre connaissance du code de conduite, puis signer électroniquement.",

  'error.expired_or_submitted': 'Ce lien est expiré ou le dossier a déjà été soumis. Veuillez contacter les ressources humaines.',

  'section.info': "Informations personnelles",
  'label.firstName': 'Prénom', 'label.lastName': 'Nom',
  'label.address': 'Adresse', 'label.phone': 'Téléphone',
  'label.dob': 'Date de naissance', 'label.sin': 'Numéro d\'assurance sociale (NAS)',
  'label.email': 'Courriel',

  'section.emergency': "Contact d'urgence",
  'label.emergencyFirstName': 'Prénom', 'label.emergencyLastName': 'Nom',
  'label.emergencyPhone': 'Téléphone',

  'label.startDate': "Date de début d'emploi",

  'section.coc': 'Code de conduite',
  'coc.intro': 'Veuillez consulter le code de conduite ci-dessous avant de signer.',
  'coc.viewLink': 'Consulter le code de conduite (PDF)',
  'coc.ack': "Je confirme avoir lu et compris le code de conduite d'Oaziz Extracts.",

  'section.signature': 'Signature',
  'signature.hint': 'Cette signature sera apposée sur le formulaire de renseignements et sur votre accusé de réception du code de conduite.',
  tabDraw: 'Dessiner', tabType: 'Taper', tabUpload: 'Téléverser',
  drawHint: 'Dessinez votre signature dans le cadre ci-dessous.',
  typeHint: 'Tapez votre nom — il sera affiché en style manuscrit.',
  uploadHint: 'Téléversez une image de votre signature.',
  btnClear: 'Effacer',
  btnSubmit: 'Soumettre mon dossier',

  'error.missing': 'Veuillez remplir tous les champs obligatoires.',
  'error.ack_required': 'Veuillez confirmer avoir lu le code de conduite.',
  'error.signature_required': 'Veuillez fournir votre signature.',
  'error.imageTooLarge': "L'image est trop volumineuse (max 4 Mo).",
  'error.generic': 'Une erreur est survenue. Veuillez réessayer.',
  'error.network': 'Erreur réseau. Veuillez réessayer.',
  statusSending: 'Envoi en cours…',

  'success.title': 'Merci !',
  'success.body': "Votre dossier a été soumis avec succès. Il sera révisé et contresigné par notre équipe, puis vous recevrez une copie finale par courriel.",
} as const;

export type RhPackageDict = typeof frRhPackage;

export const enRhPackage: Partial<Record<keyof RhPackageDict, string>> = {
  pageTitle: 'Onboarding Package',
  heading: 'Welcome to Oaziz Extracts!',
  intro: "To complete your employee file, please fill in the form below, review the code of conduct, then sign electronically.",

  'error.expired_or_submitted': 'This link has expired or the package has already been submitted. Please contact Human Resources.',

  'section.info': 'Personal Information',
  'label.firstName': 'First Name', 'label.lastName': 'Last Name',
  'label.address': 'Address', 'label.phone': 'Phone',
  'label.dob': 'Date of Birth', 'label.sin': 'Social Insurance Number (SIN)',
  'label.email': 'Email',

  'section.emergency': 'Emergency Contact',
  'label.emergencyFirstName': 'First Name', 'label.emergencyLastName': 'Last Name',
  'label.emergencyPhone': 'Phone',

  'label.startDate': 'Start Date',

  'section.coc': 'Code of Conduct',
  'coc.intro': 'Please review the code of conduct below before signing.',
  'coc.viewLink': 'View the code of conduct (PDF)',
  'coc.ack': "I confirm I have read and understood Oaziz Extracts' code of conduct.",

  'section.signature': 'Signature',
  'signature.hint': 'This signature will be applied to your information form and to your code of conduct acknowledgement.',
  tabDraw: 'Draw', tabType: 'Type', tabUpload: 'Upload',
  drawHint: 'Draw your signature in the box below.',
  typeHint: 'Type your name — it will be rendered in a handwritten style.',
  uploadHint: 'Upload an image of your signature.',
  btnClear: 'Clear',
  btnSubmit: 'Submit my file',

  'error.missing': 'Please fill in all required fields.',
  'error.ack_required': 'Please confirm you have read the code of conduct.',
  'error.signature_required': 'Please provide your signature.',
  'error.imageTooLarge': 'The image is too large (max 4 MB).',
  'error.generic': 'An error occurred. Please try again.',
  'error.network': 'Network error. Please try again.',
  statusSending: 'Sending…',

  'success.title': 'Thank you!',
  'success.body': "Your file has been submitted successfully. It will be reviewed and countersigned by our team, and you'll receive a final copy by email.",
};
