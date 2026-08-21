// Page-specific strings for /portail/demande/[id]/editer (edit submission form).
//
// Field VALUES pre-filled from the submission row (product name, quantity,
// rnd_objective, etc.) are the staff member's own previously-entered content
// and are never translated — only the static label/hint/button chrome around
// them lives in this dictionary. Status labels ("Brouillon"/"Draft" etc.) and
// the "Vrac"/"Emballé" state labels, the QA/consent role names, and the
// "Annuler" button reuse src/i18n/portail/common.ts instead of duplicating
// them here.

export const frDemandeEditer = {
  title: 'Modifier la demande',
  backLink: '← Retour à la demande',
  heading: 'Modifier la demande',
  currentStatus: 'Statut actuel :',
  fixedTag: '(fixé)',

  'warning.label': '⚠ Attention :',
  'warning.intro': 'cette demande a déjà été envoyée pour signature. Enregistrer les modifications va :',
  'warning.item1': 'Supprimer tous les jetons de signature actuels (les liens envoyés cesseront de fonctionner)',
  'warning.item2': 'Effacer toutes les signatures déjà collectées',
  'warning.item3': "Supprimer le PDF signé s'il existait",
  'warning.item4Before': "Remettre la demande à l'état ",
  'warning.item4After': ' — vous devrez cliquer « Envoyer pour signature » à nouveau',

  'error.missing': 'Veuillez remplir tous les champs obligatoires.',
  'error.no_participants': 'Sélectionnez au moins un participant.',
  'error.not_creator': 'Seul le créateur peut modifier cette demande.',
  'error.unknown': 'Une erreur est survenue lors de la mise à jour.',

  confirmDialog: 'Confirmer la modification ? Toutes les signatures actuelles seront effacées.',

  'label.formDate': 'Date (JJ/MM/AAAA)',
  'label.initiatorName': "Nom de l'initiateur",
  'label.productName': 'Nom du produit / souche',
  'label.productType': 'Type de produit',
  'label.quantity': 'Quantité totale (g ou unités)',
  'hint.quantity': 'Divisée automatiquement entre les participants sur les formulaires R&D.',
  'label.objective': "Objectif de l'étude",
  'label.participants': 'Participants',

  'heading.production': 'À remplir par le personnel de production',
  'label.productionStaff': 'Personnel de production',
  'label.productionState': 'État de production',
  'label.productionId': 'Identifiant du lot (ID)',

  'heading.signatureRoles': 'Rôles pour la signature',

  'submit.draft': 'Enregistrer et repasser en brouillon',
  'submit.normal': 'Enregistrer les modifications',
} as const;

export type DemandeEditerDict = typeof frDemandeEditer;

export const enDemandeEditer: Partial<Record<keyof DemandeEditerDict, string>> = {
  title: 'Edit request',
  backLink: '← Back to request',
  heading: 'Edit request',
  currentStatus: 'Current status:',
  fixedTag: '(fixed)',

  'warning.label': '⚠ Warning:',
  'warning.intro': 'this request has already been sent for signature. Saving the changes will:',
  'warning.item1': 'Delete all current signature tokens (links already sent will stop working)',
  'warning.item2': 'Clear all signatures already collected',
  'warning.item3': 'Delete the signed PDF if one existed',
  'warning.item4Before': 'Reset the request to ',
  'warning.item4After': ' status — you will need to click "Send for signature" again',

  'error.missing': 'Please fill in all required fields.',
  'error.no_participants': 'Select at least one participant.',
  'error.not_creator': 'Only the creator can edit this request.',
  'error.unknown': 'An error occurred while updating.',

  confirmDialog: 'Confirm the change? All current signatures will be cleared.',

  'label.formDate': 'Date (DD/MM/YYYY)',
  'label.initiatorName': "Initiator's name",
  'label.productName': 'Product name / strain',
  'label.productType': 'Product type',
  'label.quantity': 'Total quantity (g or units)',
  'hint.quantity': 'Automatically split between participants on the R&D forms.',
  'label.objective': 'Study objective',
  'label.participants': 'Participants',

  'heading.production': 'To be completed by production staff',
  'label.productionStaff': 'Production staff',
  'label.productionState': 'Production state',
  'label.productionId': 'Batch ID',

  'heading.signatureRoles': 'Roles for signature',

  'submit.draft': 'Save and revert to draft',
  'submit.normal': 'Save changes',
};
