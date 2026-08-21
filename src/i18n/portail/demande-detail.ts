// Page-specific strings for the submission detail/tracking page
// (src/pages/portail/demande/[id].astro). Shared status/state/role/kind
// labels live in src/i18n/portail/common.ts — this file only holds strings
// unique to this page.

export const frDemandeDetail = {
  backLink: '← Formulaires R&D',
  createdOn: 'Créé le',
  untitled: 'Demande',

  signNow: '✍ Signer maintenant',
  signNowTitle: 'Signer directement dans le portail',
  downloadPdf: '⬇ Télécharger le PDF',
  downloadPdfTitle: "Télécharger le PDF (partiel tant que la demande n'est pas finalisée)",
  resendFinal: '📧 Renvoyer le courriel finalisé',
  resendFinalTitle: 'Renvoyer le courriel avec PDF signé à la liste de distribution',

  'info.sent': 'Demande envoyée. Les signataires ont reçu leur lien par courriel.',
  'info.edited': 'Modifications enregistrées. La demande est repassée en brouillon — cliquez « Envoyer pour signature » pour réémettre les liens.',
  'info.signed': 'Merci, votre signature a été enregistrée.',
  'info.resent': 'Courriel finalisé renvoyé à la liste de distribution.',

  'error.not_creator': 'Seul le créateur de la demande peut effectuer cette action.',
  'error.already_sent': 'Cette demande a déjà été envoyée.',
  'error.already_signed_row': 'Ce signataire a déjà signé — pas besoin de régénérer.',
  'error.no_participants': "Ajoutez au moins un participant avant d'envoyer.",
  'error.not_found': 'Demande introuvable.',
  'error.not_finalized': 'La demande doit être entièrement signée avant de renvoyer le courriel finalisé.',
  'error.nothing_to_sign': "Vous n'avez aucune signature en attente sur cette demande.",
  'error.unknown': 'Une erreur est survenue.',
  'error.token_insert': 'Impossible de créer les jetons de signature. Réessayez.',
  'error.signer_insert': 'Impossible de créer les signataires. Réessayez.',
  'error.delete': 'La suppression a échoué.',

  'emailStatus.sent': 'Courriel envoyé.',
  'emailStatus.skipped_no_key': 'Aucun courriel envoyé (clé Resend non configurée). Copiez le lien ci-dessous.',
  'emailStatus.error': "L'envoi du courriel a échoué. Copiez le lien manuellement ci-dessous.",

  'reveal.heading': 'Nouveau lien de signature pour',
  'reveal.defaultCopy': 'Copiez le lien ci-dessous pour le partager.',
  'reveal.previousRevoked': 'Le lien précédent pour cette personne a été révoqué.',
  'reveal.copy': 'Copier',
  'reveal.copied': 'Copié ✓',

  'section.details': 'Détails',
  'section.participants': 'Participants',
  'section.signatures': 'Signatures',

  'field.formDate': 'Date du formulaire',
  'field.initiator': 'Initiateur',
  'field.productType': 'Type de produit',
  'field.quantity': 'Quantité',
  'field.productionState': 'État de production',
  'field.productionId': 'Identifiant du lot',
  'field.productionStaff': 'Personnel de production',
  'field.qaVerification': 'Vérification AQ',
  'field.consentObtainer': 'Personne obtenant le consentement',

  'participants.empty': 'Aucun participant.',

  'signatures.emptyDraft': 'Les signataires seront créés lorsque la demande sera envoyée.',
  'signatures.emptyOther': 'Aucun signataire enregistré.',

  'th.role': 'Rôle',
  'th.signer': 'Signataire',
  'th.document': 'Document',
  'th.status': 'Statut',
  'th.signedOn': 'Signé le',

  signerFor: 'Pour',
  'pill.signed': 'Signé',
  'pill.pending': 'En attente',
  regenerateLink: 'Régénérer le lien',

  sendForSignature: 'Envoyer pour signature',
  'confirm.send': 'Envoyer les liens de signature à chaque signataire par courriel ?',
  editSuffixNotDraft: ' (efface les signatures)',
  deleteSuffixNotDraft: ' (définitif)',
  'confirm.deleteDraft': 'Supprimer ce brouillon ?',
  'confirm.deleteSent': '⚠ Cette demande a été envoyée pour signature. Supprimer va effacer définitivement les signatures collectées, le PDF signé, et les liens envoyés. Continuer ?',
} as const;

export type DemandeDetailDict = typeof frDemandeDetail;

export const enDemandeDetail: Partial<Record<keyof DemandeDetailDict, string>> = {
  backLink: '← R&D Forms',
  createdOn: 'Created on',
  untitled: 'Request',

  signNow: '✍ Sign now',
  signNowTitle: 'Sign directly in the portal',
  downloadPdf: '⬇ Download PDF',
  downloadPdfTitle: 'Download the PDF (partial until the request is finalized)',
  resendFinal: '📧 Resend finalized email',
  resendFinalTitle: 'Resend the email with the signed PDF to the distribution list',

  'info.sent': 'Request sent. Signers have received their link by email.',
  'info.edited': 'Changes saved. The request is back in draft — click "Send for signature" to reissue the links.',
  'info.signed': 'Thank you, your signature has been recorded.',
  'info.resent': 'Finalized email resent to the distribution list.',

  'error.not_creator': 'Only the creator of the request can perform this action.',
  'error.already_sent': 'This request has already been sent.',
  'error.already_signed_row': 'This signer has already signed — no need to regenerate.',
  'error.no_participants': 'Add at least one participant before sending.',
  'error.not_found': 'Request not found.',
  'error.not_finalized': 'The request must be fully signed before resending the finalized email.',
  'error.nothing_to_sign': 'You have no pending signature on this request.',
  'error.unknown': 'An error occurred.',
  'error.token_insert': 'Could not create the signing tokens. Try again.',
  'error.signer_insert': 'Could not create the signers. Try again.',
  'error.delete': 'Deletion failed.',

  'emailStatus.sent': 'Email sent.',
  'emailStatus.skipped_no_key': 'No email sent (Resend key not configured). Copy the link below.',
  'emailStatus.error': 'Sending the email failed. Copy the link manually below.',

  'reveal.heading': 'New signing link for',
  'reveal.defaultCopy': 'Copy the link below to share it.',
  'reveal.previousRevoked': 'The previous link for this person has been revoked.',
  'reveal.copy': 'Copy',
  'reveal.copied': 'Copied ✓',

  'section.details': 'Details',
  'section.participants': 'Participants',
  'section.signatures': 'Signatures',

  'field.formDate': 'Form date',
  'field.initiator': 'Initiator',
  'field.productType': 'Product type',
  'field.quantity': 'Quantity',
  'field.productionState': 'Production state',
  'field.productionId': 'Batch ID',
  'field.productionStaff': 'Production staff',
  'field.qaVerification': 'QA verification',
  'field.consentObtainer': 'Consent collector',

  'participants.empty': 'No participants.',

  'signatures.emptyDraft': 'Signers will be created once the request is sent.',
  'signatures.emptyOther': 'No signers on record.',

  'th.role': 'Role',
  'th.signer': 'Signer',
  'th.document': 'Document',
  'th.status': 'Status',
  'th.signedOn': 'Signed on',

  signerFor: 'For',
  'pill.signed': 'Signed',
  'pill.pending': 'Pending',
  regenerateLink: 'Regenerate link',

  sendForSignature: 'Send for signature',
  'confirm.send': 'Send the signing links to each signer by email?',
  editSuffixNotDraft: ' (erases signatures)',
  deleteSuffixNotDraft: ' (permanent)',
  'confirm.deleteDraft': 'Delete this draft?',
  'confirm.deleteSent': '⚠ This request has already been sent for signature. Deleting will permanently erase the collected signatures, the signed PDF, and the sent links. Continue?',
};
