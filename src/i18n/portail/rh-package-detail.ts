export const frRhPackageDetail = {
  backLink: '← Dossiers de nouveaux employés',
  title: 'Dossier de nouvel employé',

  'label.email': 'Courriel', 'label.language': 'Langue', 'label.sentAt': 'Envoyé le',
  'lang.fr': 'Français', 'lang.en': 'English',

  'status.sent': "En attente de l'employé",
  'status.awaiting_witness': 'En attente de contresignature',
  'status.completed': 'Complété',

  'sent.hint': "En attente que l'employé remplisse et signe son dossier.",

  'witness.notYou.hint': 'En attente de la contresignature de {name}.',
  'witness.heading': 'Contresignature requise',
  'witness.hint': "L'employé a rempli et signé son dossier. Veuillez réviser les documents ci-dessous, puis apposer votre signature pour compléter le dossier.",
  'witness.viewInfo': "Voir le formulaire d'informations signé",
  'witness.viewCoc': 'Voir le code de conduite',
  tabDraw: 'Dessiner', tabType: 'Taper', tabUpload: 'Téléverser',
  drawHint: 'Dessinez votre signature dans le cadre ci-dessous.',
  typeHint: 'Tapez votre nom — il sera affiché en style manuscrit.',
  uploadHint: 'Téléversez une image de votre signature.',
  savedSigLoaded: 'Votre signature enregistrée a été chargée — vous pouvez la modifier au besoin.',
  saveSigCheckbox: 'Enregistrer cette signature pour la prochaine fois',
  btnClear: 'Effacer',
  btnSubmit: 'Contresigner et compléter le dossier',
  statusSending: 'Envoi en cours…',
  'error.generic': 'Une erreur est survenue.',
  'error.network': 'Erreur réseau. Veuillez réessayer.',
  'error.imageTooLarge': "L'image est trop volumineuse (max 4 Mo).",

  'completed.heading': 'Dossier complété',
  'completed.hint': 'Les documents finaux signés sont disponibles ci-dessous.',
  'completed.downloadInfo': "Formulaire d'informations (PDF)",
  'completed.downloadCoc': 'Code de conduite signé (PDF)',

  'info.countersigned': 'Dossier complété avec succès.',
} as const;

export type RhPackageDetailDict = typeof frRhPackageDetail;

export const enRhPackageDetail: Partial<Record<keyof RhPackageDetailDict, string>> = {
  backLink: '← New Employee Packages',
  title: 'New Employee Package',

  'label.email': 'Email', 'label.language': 'Language', 'label.sentAt': 'Sent on',
  'lang.fr': 'Français', 'lang.en': 'English',

  'status.sent': 'Awaiting employee',
  'status.awaiting_witness': 'Awaiting countersignature',
  'status.completed': 'Completed',

  'sent.hint': 'Waiting for the employee to fill in and sign their file.',

  'witness.notYou.hint': 'Awaiting countersignature from {name}.',
  'witness.heading': 'Countersignature required',
  'witness.hint': 'The employee has filled in and signed their file. Please review the documents below, then apply your signature to complete the file.',
  'witness.viewInfo': 'View signed information form',
  'witness.viewCoc': 'View code of conduct',
  tabDraw: 'Draw', tabType: 'Type', tabUpload: 'Upload',
  drawHint: 'Draw your signature in the box below.',
  typeHint: 'Type your name — it will be rendered in a handwritten style.',
  uploadHint: 'Upload an image of your signature.',
  savedSigLoaded: 'Your saved signature has been loaded — you can change it if needed.',
  saveSigCheckbox: 'Save this signature for next time',
  btnClear: 'Clear',
  btnSubmit: 'Countersign and complete the file',
  statusSending: 'Sending…',
  'error.generic': 'An error occurred.',
  'error.network': 'Network error. Please try again.',
  'error.imageTooLarge': 'The image is too large (max 4 MB).',

  'completed.heading': 'File completed',
  'completed.hint': 'The final signed documents are available below.',
  'completed.downloadInfo': 'Information form (PDF)',
  'completed.downloadCoc': 'Signed code of conduct (PDF)',

  'info.countersigned': 'File completed successfully.',
};
