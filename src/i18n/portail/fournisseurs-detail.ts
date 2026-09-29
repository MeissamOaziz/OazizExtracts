export const frFournisseursDetail = {
  backLink: '← Fournisseurs',
  submittedOn: 'Reçu le',
  notFound: 'Dossier introuvable.',

  'info.approved': 'Votre approbation a été enregistrée.',
  'error.not_approver': "Vous n'êtes pas une des personnes désignées pour approuver ce dossier.",
  'error.unknown': 'Une erreur est survenue.',

  'section.contacts': 'Personnes-ressources',
  'label.salesContact': 'Ventes',
  'label.qaContact': 'Assurance qualité',
  'label.accountingContact': 'Comptabilité',

  'field.vendorType': "Type d'entreprise",

  'section.company': 'A) Renseignements sur l\'entreprise',
  'field.companyName': "Nom de l'entreprise",
  'field.address': 'Adresse',
  'field.cityProvincePostal': 'Ville / Province / Code postal',
  'field.contactPerson': 'Personne(s)-ressource(s)',
  'field.phone': 'Téléphone',
  'field.email': 'Courriel',

  'section.shipping': 'Adresse de livraison',
  'shipping.same': "Identique à l'adresse ci-dessus.",

  'notYetSubmitted': "Ce dossier est encore à l'état de brouillon — le fournisseur ne l'a pas encore soumis. Il n'apparaît pas dans la liste des approbations tant qu'il n'est pas soumis.",

  'section.tax': "Numéros d'entreprise",
  'field.businessNumber': "Numéro d'entreprise",
  'field.gstHst': 'TPS/TVH',
  'field.qst': 'TVQ',

  'section.banking': 'Renseignements bancaires',
  'bankingWarning': 'Renseignements sensibles — à ne partager qu\'avec le personnel autorisé.',
  'field.bankInstitution': "N° d'institution",
  'field.bankTransit': 'N° de transit',
  'field.bankAccount': 'N° de compte',
  'field.bankAddress': 'Adresse de la banque',

  'section.documents': 'Documents',
  'doc.cra': 'Licence CRA',
  'doc.hc': 'Licence Santé Canada',
  'doc.bankProof': 'Chèque spécimen / lettre bancaire',
  downloadBtn: 'Télécharger',
  notProvided: 'Non fourni',

  'section.culture': 'B) Renseignements sur la culture',
  'field.productionType': 'Type de production',
  'field.cultivationMethods': 'Méthode de culture',
  'field.lightingType': "Type d'éclairage",
  'field.mediumType': 'Type de substrat',
  'field.nutrientType': 'Type de nutriments',
  'field.cultivarName': 'Nom du cultivar',
  'field.existingCoas': 'COA existants',
  'field.startingMaterial': 'Matériel de départ',
  'field.pesticidesUsed': 'Pesticides / fongicides / herbicides',

  'section.certification': 'C) Certification',
  'field.certifiedBy': 'Complété par',
  certifiedYes: 'A certifié que les renseignements sont exacts.',

  'section.approvals': 'Approbations requises',
  'approvals.intro': "Chacune des personnes ci-dessous doit réviser ce dossier et cliquer « Approuver » individuellement. Cet historique sert de preuve en cas de vérification par Santé Canada.",
  'th.approver': 'Approbateur',
  'th.status': 'Statut',
  'th.approvedOn': 'Approuvé le',
  approvedPill: 'Approuvé',
  pendingPill: 'En attente',
  approveBtn: "J'approuve ce fournisseur",
  yourApprovalDone: 'Vous avez déjà approuvé ce dossier.',

  fullyApprovedBanner: 'Ce dossier a été approuvé par toutes les personnes désignées.',
} as const;

export type FournisseursDetailDict = typeof frFournisseursDetail;

export const enFournisseursDetail: Partial<Record<keyof FournisseursDetailDict, string>> = {
  backLink: '← Vendors',
  submittedOn: 'Received on',
  notFound: 'File not found.',

  'info.approved': 'Your approval has been recorded.',
  'error.not_approver': 'You are not one of the people designated to approve this file.',
  'error.unknown': 'An error occurred.',

  'section.contacts': 'Contacts',
  'label.salesContact': 'Sales',
  'label.qaContact': 'Quality assurance',
  'label.accountingContact': 'Accounting',

  'field.vendorType': 'Business type',

  'section.company': 'A) Company information',
  'field.companyName': 'Company name',
  'field.address': 'Address',
  'field.cityProvincePostal': 'City / Province / Postal code',
  'field.contactPerson': 'Contact person(s)',
  'field.phone': 'Phone',
  'field.email': 'Email',

  'section.shipping': 'Shipping address',
  'shipping.same': 'Same as address above.',

  'notYetSubmitted': "This file is still a draft — the vendor hasn't submitted it yet. It won't appear in the approvals list until it's submitted.",

  'section.tax': 'Business numbers',
  'field.businessNumber': 'Business number',
  'field.gstHst': 'GST/HST',
  'field.qst': 'QST',

  'section.banking': 'Banking information',
  'bankingWarning': 'Sensitive information — share only with authorized staff.',
  'field.bankInstitution': 'Institution #',
  'field.bankTransit': 'Transit #',
  'field.bankAccount': 'Account #',
  'field.bankAddress': 'Bank address',

  'section.documents': 'Documents',
  'doc.cra': 'CRA license',
  'doc.hc': 'Health Canada license',
  'doc.bankProof': 'Void cheque / bank letter',
  downloadBtn: 'Download',
  notProvided: 'Not provided',

  'section.culture': 'B) Culture information',
  'field.productionType': 'Type of production',
  'field.cultivationMethods': 'Cultivation method',
  'field.lightingType': 'Type of lighting',
  'field.mediumType': 'Type of medium',
  'field.nutrientType': 'Type of nutriments',
  'field.cultivarName': 'Cultivar name',
  'field.existingCoas': 'Existing COAs',
  'field.startingMaterial': 'Starting material',
  'field.pesticidesUsed': 'Pesticides / fungicides / herbicides',

  'section.certification': 'C) Certification',
  'field.certifiedBy': 'Completed by',
  certifiedYes: 'Certified that the information provided is correct.',

  'section.approvals': 'Required approvals',
  'approvals.intro': 'Each of the people below must review this file and click "Approve" individually. This history serves as proof in case of a Health Canada audit.',
  'th.approver': 'Approver',
  'th.status': 'Status',
  'th.approvedOn': 'Approved on',
  approvedPill: 'Approved',
  pendingPill: 'Pending',
  approveBtn: 'I approve this vendor',
  yourApprovalDone: 'You have already approved this file.',

  fullyApprovedBanner: 'This file has been approved by everyone required.',
};
