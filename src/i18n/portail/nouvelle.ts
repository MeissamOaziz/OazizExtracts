// Page-specific strings for /portail/nouvelle (new sample request form).
//
// IMPORTANT: this page also submits `rnd_objective`, whose default textarea
// VALUE is printed verbatim on the French R&D document (DocRnd.astro). That
// default string lives in nouvelle.astro as DEFAULT_OBJECTIVE and is
// intentionally NOT part of this dictionary — it must stay French regardless
// of portal UI locale. Only this page's UI chrome (labels, hints, headings,
// buttons) is translated here.

export const frNouvelle = {
  title: 'Nouvelle demande',
  backLink: '← Retour aux formulaires',
  heading: "Nouvelle demande d'échantillon",
  subtitleSection: "Section « À remplir par l'initiateur »",
  fixedTag: '(fixé)',

  'error.missing': 'Veuillez remplir tous les champs obligatoires.',
  'error.no_participants': 'Sélectionnez au moins un participant.',
  'error.no_jorge': 'Jorge Sousa doit exister dans la liste du personnel (rôles fixes).',
  'error.no_stephane': 'Stephane Paquin doit exister dans la liste du personnel (rôle AQ).',
  'error.unknown': "Une erreur est survenue lors de l'enregistrement.",

  'label.formDate': 'Date (JJ/MM/AAAA)',
  'label.initiatorName': "Nom de l'initiateur",
  'label.productName': 'Nom du produit / souche',
  'label.productType': 'Type de produit',
  'placeholder.productType': 'ex: Rosin, Hash, Kief…',
  'label.quantity': 'Quantité totale (g ou unités)',
  'placeholder.quantity': 'ex: 20 g',
  'hint.quantity': 'Sera automatiquement divisée en parts égales entre les participants sur les formulaires R&D.',
  'label.objective': "Objectif de l'étude",
  'hint.objective': 'Modifiable. Apparaîtra dans la section DESCRIPTION du formulaire R&D.',
  'label.participants': 'Participants',
  'hint.participants': 'Un formulaire R&D et un consentement seront générés par participant.',

  'heading.production': 'À remplir par le personnel de production',
  'label.productionState': 'État de production',
  'label.productionId': 'Identifiant du lot (ID)',

  'heading.signatureRoles': 'Rôles pour la signature',
  'hint.signatureRoles': 'Les rôles ci-dessous sont fixés pour toutes les demandes.',

  submit: 'Enregistrer le brouillon',
} as const;

export type NouvelleDict = typeof frNouvelle;

export const enNouvelle: Partial<Record<keyof NouvelleDict, string>> = {
  title: 'New request',
  backLink: '← Back to forms',
  heading: 'New sample request',
  subtitleSection: 'Section "To be completed by the initiator"',
  fixedTag: '(fixed)',

  'error.missing': 'Please fill in all required fields.',
  'error.no_participants': 'Select at least one participant.',
  'error.no_jorge': 'Jorge Sousa must exist in the staff list (fixed roles).',
  'error.no_stephane': 'Stephane Paquin must exist in the staff list (QA role).',
  'error.unknown': 'An error occurred while saving.',

  'label.formDate': 'Date (DD/MM/YYYY)',
  'label.initiatorName': "Initiator's name",
  'label.productName': 'Product name / strain',
  'label.productType': 'Product type',
  'placeholder.productType': 'e.g. Rosin, Hash, Kief…',
  'label.quantity': 'Total quantity (g or units)',
  'placeholder.quantity': 'e.g. 20 g',
  'hint.quantity': 'Will be automatically split into equal shares between participants on the R&D forms.',
  'label.objective': 'Study objective',
  'hint.objective': 'Editable. Will appear in the DESCRIPTION section of the R&D form.',
  'label.participants': 'Participants',
  'hint.participants': 'One R&D form and one consent form will be generated per participant.',

  'heading.production': 'To be completed by production staff',
  'label.productionState': 'Production state',
  'label.productionId': 'Batch ID',

  'heading.signatureRoles': 'Roles for signature',
  'hint.signatureRoles': 'The roles below are fixed for all requests.',

  submit: 'Save draft',
};
