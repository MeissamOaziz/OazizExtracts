// Shared strings reused across multiple portal pages: nav, generic buttons,
// and the status/state/role/kind label maps used on the dashboard, the
// submission detail page, and the edit page. Keep this file read-only from
// other pages' perspective — page-specific strings belong in their own
// src/i18n/portail/<page>.ts file so parallel edits never collide here.

export const frCommon = {
  'nav.home': 'Accueil',
  'nav.forms': 'Formulaires R&D',
  'nav.calculators': 'Calculatrices',
  'nav.logout': 'Déconnexion',

  'btn.save': 'Enregistrer',
  'btn.cancel': 'Annuler',
  'btn.delete': 'Supprimer',
  'btn.edit': 'Modifier',
  'btn.back': 'Retour',
  'btn.open': 'Ouvrir',
  'btn.sign': 'Signer',
  'btn.download': 'Télécharger',

  'status.draft': 'Brouillon',
  'status.sent': 'Envoyé',
  'status.signing': 'En signature',
  'status.complete': 'Complet',
  'status.finalized': 'Finalisé',
  'status.cancelled': 'Annulé',

  'state.vrac': 'Vrac',
  'state.emballe': 'Emballé',

  'role.initiator': 'Initiateur',
  'role.production': 'Personnel de production',
  'role.participant': 'Participant',
  'role.consent_obtainer': 'Personne obtenant le consentement',
  'role.qa_verifier': 'Vérification AQ',

  'kind.sample_request': "Demande d'échantillon",
  'kind.rnd': 'R&D',
  'kind.consent': 'Consentement',
} as const;

export type CommonDict = typeof frCommon;

export const enCommon: Partial<Record<keyof CommonDict, string>> = {
  'nav.home': 'Home',
  'nav.forms': 'R&D Forms',
  'nav.calculators': 'Calculators',
  'nav.logout': 'Log out',

  'btn.save': 'Save',
  'btn.cancel': 'Cancel',
  'btn.delete': 'Delete',
  'btn.edit': 'Edit',
  'btn.back': 'Back',
  'btn.open': 'Open',
  'btn.sign': 'Sign',
  'btn.download': 'Download',

  'status.draft': 'Draft',
  'status.sent': 'Sent',
  'status.signing': 'Signing',
  'status.complete': 'Complete',
  'status.finalized': 'Finalized',
  'status.cancelled': 'Cancelled',

  'state.vrac': 'Bulk',
  'state.emballe': 'Packaged',

  'role.initiator': 'Initiator',
  'role.production': 'Production staff',
  'role.participant': 'Participant',
  'role.consent_obtainer': 'Consent collector',
  'role.qa_verifier': 'QA verification',

  'kind.sample_request': 'Sample request',
  'kind.rnd': 'R&D',
  'kind.consent': 'Consent',
};
