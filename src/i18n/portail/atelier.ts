// Atelier — module chrome. Field labels live in the table specs
// (src/lib/ops.ts) so a column and its label can never drift apart.

export const frAtelier = {
  'title': 'Atelier',
  'greeting': 'Atelier',
  'subtitle':
    'Des commandes aux expéditions : une seule vue sur où en est chaque projet de production.',

  'section.orders': 'Commandes',
  'section.orders.desc':
    'Toutes les commandes en cours, quelle que soit leur provenance, avec leur bon de travail.',
  'section.newOrder': 'Nouvelle entrée',
  'section.newOrder.desc':
    'Saisir un bon de commande client, une demande de réapprovisionnement ou un run d’emballage.',

  'section.planning': 'Planification',
  'section.planning.desc':
    'Tableau, calendrier, Gantt et occupation des salles — les mêmes étapes vues de quatre façons.',

  'section.inventory': 'Inventaire',
  'section.inventory.desc':
    'Ce qui reste en stock, par catégorie et par puissance. Lots libérés et non libérés.',

  'section.destructions': 'Destructions',
  'section.destructions.desc':
    'Détruire du produit : approbation AQ, témoins, attestation. Alimente la ligne « quantité détruite » du B300.',
  'section.packaging': 'Emballage',
  'section.packaging.desc':
    'Transformer un lot en unités étiquetées. Ce qui manque à l’étiquette bloque la clôture.',
  'section.lots': 'Lots et traçabilité',
  'section.lots.desc':
    'Réception de matière, registre des lots, et la trace de chaque gramme du fournisseur au client.',

  'section.settings': 'Paramètres',
  'section.settings.desc':
    'Salles, procédés, matières, produits et clients. Tout ce que le reste du module utilise comme référence.',

  'phase.notice.title': 'Phase 2 en place',
  'phase.notice.body':
    'La saisie des commandes est en place : chaque commande crée son bon de travail. La planification par étapes et le bon de travail d’expédition arrivent aux phases suivantes.',

  'settings.title': 'Paramètres de l’Atelier',
  'settings.subtitle':
    'Les données de référence du module. Modifiables par la direction de production et l’administration.',

  'btn.new': 'Nouveau',
  'btn.edit': 'Modifier',
  'btn.delete': 'Supprimer',
  'btn.save': 'Enregistrer',
  'btn.cancel': 'Annuler',
  'btn.back': 'Retour aux paramètres',

  'list.count': '{n} entrées',
  'list.empty': 'Aucune entrée pour l’instant.',
  'list.search': 'Rechercher…',
  'list.searchNone': 'Aucun résultat pour cette recherche.',

  'form.new': 'Nouvelle entrée',
  'form.edit': 'Modifier l’entrée',
  'form.required': 'Champ obligatoire',
  'form.none': '— aucun —',

  'readonly.notice':
    'Lecture seule : la modification des données de référence est réservée à la direction de production et à l’administration.',

  'flash.created': 'Entrée créée.',
  'flash.updated': 'Modifications enregistrées.',
  'flash.deleted': 'Entrée supprimée.',
  'flash.error.missing': 'Il manque un ou plusieurs champs obligatoires.',
  'flash.error.denied':
    'Votre rôle ne permet pas de modifier les données de référence.',
  'flash.error.unknown': 'L’enregistrement a échoué. Réessayez.',
  'flash.error.notfound': 'Entrée introuvable.',

  'yes': 'Oui',
  'no': 'Non',
} as const;

export type AtelierDict = typeof frAtelier;

export const enAtelier: Partial<Record<keyof AtelierDict, string>> = {
  'title': 'Atelier',
  'greeting': 'Atelier',
  'subtitle':
    'From orders to shipments: one view of where every production job stands.',

  'section.orders': 'Orders',
  'section.orders.desc':
    'Every open order, whichever door it came through, with its work order.',
  'section.newOrder': 'New entry',
  'section.newOrder.desc':
    'Enter a customer PO, an internal refill request or a packaging run.',

  'section.planning': 'Planning',
  'section.planning.desc':
    'Board, calendar, Gantt and room occupancy — the same stages seen four ways.',

  'section.inventory': 'Inventory',
  'section.inventory.desc':
    'What is left in stock, by category and potency. Released lots and batches.',

  'section.destructions': 'Destructions',
  'section.destructions.desc':
    'Destroying product: QA approval, witnesses, attestation. Feeds the B300 “quantity destroyed” line.',
  'section.packaging': 'Packaging',
  'section.packaging.desc':
    'Turn a lot into labelled units. Anything missing from the label stops the run closing.',
  'section.lots': 'Lots & traceability',
  'section.lots.desc':
    'Receive material, the lot register, and the trace of every gram from supplier to customer.',

  'section.settings': 'Settings',
  'section.settings.desc':
    'Rooms, processes, materials, products and customers. Everything the rest of the module treats as reference data.',

  'phase.notice.title': 'Phase 2 is live',
  'phase.notice.body':
    'Order intake is live: every order creates its work order. Stage planning and the shipping work order come in the phases that follow.',

  'settings.title': 'Atelier settings',
  'settings.subtitle':
    'The module’s reference data. Editable by production management and administration.',

  'btn.new': 'New',
  'btn.edit': 'Edit',
  'btn.delete': 'Delete',
  'btn.save': 'Save',
  'btn.cancel': 'Cancel',
  'btn.back': 'Back to settings',

  'list.count': '{n} entries',
  'list.empty': 'Nothing here yet.',
  'list.search': 'Search…',
  'list.searchNone': 'No results for that search.',

  'form.new': 'New entry',
  'form.edit': 'Edit entry',
  'form.required': 'Required',
  'form.none': '— none —',

  'readonly.notice':
    'Read-only: editing reference data is limited to production management and administration.',

  'flash.created': 'Entry created.',
  'flash.updated': 'Changes saved.',
  'flash.deleted': 'Entry deleted.',
  'flash.error.missing': 'One or more required fields are missing.',
  'flash.error.denied': 'Your role cannot edit reference data.',
  'flash.error.unknown': 'Saving failed. Please try again.',
  'flash.error.notfound': 'Entry not found.',

  'yes': 'Yes',
  'no': 'No',
};
