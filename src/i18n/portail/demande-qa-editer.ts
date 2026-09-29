// Page-specific strings for /portail/demande/[id]/qa-editer — the privileged
// correction page available only to the QA verifier (Stephane Paquin) on a
// submission. Unlike the regular edit page, this one never wipes signatures
// or resets status; if the QA signature was already captured, it instead
// requires a fresh copy of that signature to approve the correction.

export const frDemandeQaEditer = {
  title: 'Corriger (AQ)',
  backLink: '← Retour à la demande',
  heading: 'Corriger les données (vérification AQ)',
  currentStatus: 'Statut actuel :',

  resignNotice: 'Cette demande a déjà été signée par vous en tant que vérificateur AQ. Les autres signatures déjà collectées ne seront pas touchées, mais vous devez apposer une nouvelle copie de votre propre signature (avec la date du jour) pour approuver cette correction.',

  'choice.heading': 'Cette demande a déjà des signatures collectées',
  'choice.intro': 'Voulez-vous renvoyer la demande corrigée pour signature à tous les signataires, ou enregistrer la correction sans renvoyer ?',
  'choice.resend': 'Renvoyer pour signature à tous',
  'choice.keep': 'Ne pas renvoyer',
  'choice.change': '← Changer de choix',
  confirmResend: 'Renvoyer la demande corrigée pour signature à tous ? Les anciens liens de signature cesseront de fonctionner.',
  keepNote: "Les signatures déjà recueillies ne seront pas touchées. Le processus de signature normal continuera là où il était rendu.",

  'label.formDate': 'Date (JJ/MM/AAAA)',
  'label.productName': 'Nom du produit / souche',
  'label.productType': 'Type de produit',
  'label.quantity': 'Quantité totale (g ou unités)',
  'label.objective': "Objectif de l'étude",
  'label.productionStaff': 'Personnel de production',
  'label.productionState': 'État de production',
  'label.productionId': 'Identifiant du lot (ID)',
  'label.packagingId': "N° d'identification de l'emballage",
  'hint.packagingId': "Si l'unité ou les unités testées sont emballées.",
  'label.qaComments': "Commentaire de l'AQ (optionnel)",
  'hint.qaComments': 'Affiché sur le document final, juste au-dessus de votre signature.',

  signatureHeading: 'Votre signature (AQ)',
  signatureHint: 'Requise pour approuver la correction — remplace votre signature précédente avec la date du jour.',
  tabDraw: 'Dessiner',
  tabType: 'Taper',
  tabUpload: 'Téléverser',
  drawHint: 'Dessinez ci-dessous avec la souris ou le doigt.',
  typeHint: 'Tapez votre nom complet.',
  uploadHint: 'Téléversez une image de votre signature (PNG, JPG).',
  savedSigLoaded: '✓ Votre signature enregistrée est chargée. Cliquez « Effacer » pour en dessiner une nouvelle.',
  btnClear: 'Effacer',
  statusSending: 'Enregistrement en cours…',

  'submit.save': 'Enregistrer la correction',
  'submit.complete': 'Approuver et signer la correction',

  errorImageTooLarge: 'Image trop volumineuse.',
  'error.missing': 'Veuillez remplir tous les champs obligatoires.',
  'error.signatureRequired': 'Veuillez apposer votre signature pour approuver cette correction.',
  'error.generic': 'Erreur — réessayez.',
  'error.network': 'Erreur réseau — réessayez.',
  successSaved: 'Correction enregistrée. Redirection…',
} as const;

export type DemandeQaEditerDict = typeof frDemandeQaEditer;

export const enDemandeQaEditer: Partial<Record<keyof DemandeQaEditerDict, string>> = {
  title: 'Correct (QA)',
  backLink: '← Back to request',
  heading: 'Correct data (QA verification)',
  currentStatus: 'Current status:',

  resignNotice: 'This request has already been signed by you as QA verifier. Other signatures already collected will not be touched, but you must apply a fresh copy of your own signature (with today\'s date) to approve this correction.',

  'choice.heading': 'This request already has signatures collected',
  'choice.intro': 'Do you want to resend the corrected request for signature to everyone, or save the correction without resending?',
  'choice.resend': 'Resend for signature to everyone',
  'choice.keep': "Don't resend",
  'choice.change': '← Change choice',
  confirmResend: 'Resend the corrected request for signature to everyone? Old signature links will stop working.',
  keepNote: 'Signatures already collected will not be touched. The normal signing process will continue where it left off.',

  'label.formDate': 'Date (DD/MM/YYYY)',
  'label.productName': 'Product name / strain',
  'label.productType': 'Product type',
  'label.quantity': 'Total quantity (g or units)',
  'label.objective': 'Study objective',
  'label.productionStaff': 'Production staff',
  'label.productionState': 'Production state',
  'label.productionId': 'Batch ID',
  'label.packagingId': 'Packaging ID number',
  'hint.packagingId': 'If the tested unit(s) are packaged.',
  'label.qaComments': 'QA comment (optional)',
  'hint.qaComments': 'Shown on the final document, just above your signature.',

  signatureHeading: 'Your signature (QA)',
  signatureHint: 'Required to approve the correction — replaces your previous signature with today\'s date.',
  tabDraw: 'Draw',
  tabType: 'Type',
  tabUpload: 'Upload',
  drawHint: 'Draw below with your mouse or finger.',
  typeHint: 'Type your full name.',
  uploadHint: 'Upload an image of your signature (PNG, JPG).',
  savedSigLoaded: '✓ Your saved signature is loaded. Click "Clear" to draw a new one.',
  btnClear: 'Clear',
  statusSending: 'Saving…',

  'submit.save': 'Save correction',
  'submit.complete': 'Approve and sign the correction',

  errorImageTooLarge: 'Image too large.',
  'error.missing': 'Please fill in all required fields.',
  'error.signatureRequired': 'Please apply your signature to approve this correction.',
  'error.generic': 'Error — try again.',
  'error.network': 'Network error — try again.',
  successSaved: 'Correction saved. Redirecting…',
};
