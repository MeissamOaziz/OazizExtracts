// Atelier — one spec per thing you can create from inside a form.
//
// Meissam, 2026-09-25: every reference picker needs an "Add new" row, because the
// autofill can only ever offer what already exists. Rather than hand-write a
// combobox, a drawer, a validator and an endpoint per entity, each entity is a
// row in QUICK_SPECS and everything else reads from here:
//
//   QuickAdd.astro                              renders the drawers
//   /api/portail/atelier/quick/[entity].ts      whitelists, coerces and inserts
//   comboRows()                                 shapes both the page seed and the
//                                               row handed back after an insert
//
// Add an entity by adding a spec. Same idea as REF_TABLES in ops.ts.

export type QuickFieldType =
  | 'text' | 'email' | 'number' | 'checkbox' | 'select' | 'fk' | 'colour' | 'textarea';

/** Option lists a drawer's `fk` fields read from, supplied by the host page. */
export type QuickLists = 'materials' | 'rooms';

export interface QuickField {
  key: string;
  fr: string;
  en: string;
  type: QuickFieldType;
  /** Blocks the save until filled. Enforced in the drawer and again in the API. */
  required?: boolean;
  /** Checkbox starting state. */
  default?: boolean;
  step?: string;
  /** Closed list for type 'select'. */
  options?: Array<{ v: string; fr: string; en: string }>;
  /** Which list of rows a type 'fk' field offers. */
  list?: QuickLists;
  /** Full width instead of sharing the two-column grid. */
  wide?: boolean;
}

export interface QuickSpec {
  kind: string;
  table: string;
  titleFr: string;
  titleEn: string;
  introFr: string;
  introEn: string;
  /** Fields that receive whatever was typed in the combobox. */
  prefill: string[];
  fields: QuickField[];
  /** Columns read back after the insert — everything comboRow() and the callers need. */
  select: string;
}

const CUSTOMER_TYPES = [
  { v: 'provincial_distributor', fr: 'Distributeur provincial', en: 'Provincial distributor' },
  { v: 'medical_platform', fr: 'Plateforme médicale', en: 'Medical platform' },
  { v: 'domestic_b2b', fr: 'B2B domestique', en: 'Domestic B2B' },
  { v: 'export', fr: 'Export', en: 'Export' },
  { v: 'internal', fr: 'Interne', en: 'Internal' },
];

const MATERIAL_CATEGORIES = [
  { v: 'cannabis_raw', fr: 'Cannabis brut', en: 'Raw cannabis' },
  { v: 'cannabis_intermediate', fr: 'Cannabis intermédiaire', en: 'Intermediate cannabis' },
  { v: 'cannabis_finished', fr: 'Cannabis fini', en: 'Finished cannabis' },
  { v: 'additive', fr: 'Additif', en: 'Additive' },
  { v: 'packaging', fr: 'Emballage', en: 'Packaging' },
  { v: 'other', fr: 'Autre', en: 'Other' },
];

const PROCESS_KINDS = [
  { v: 'extraction', fr: 'Extraction', en: 'Extraction' },
  { v: 'drying', fr: 'Séchage', en: 'Drying' },
  { v: 'formulation', fr: 'Formulation', en: 'Formulation' },
  { v: 'pressing', fr: 'Pressage', en: 'Pressing' },
  { v: 'packaging', fr: 'Emballage', en: 'Packaging' },
  { v: 'other', fr: 'Autre', en: 'Other' },
];

const PROVINCE_OPTIONS = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']
  .map((p) => ({ v: p, fr: p, en: p }));

export const QUICK_SPECS: QuickSpec[] = [
  {
    kind: 'product',
    table: 'ops_products',
    titleFr: 'Nouveau produit',
    titleEn: 'New product',
    introFr: 'Le produit est créé au statut « nouveau ». Complétez le reste dans les paramètres plus tard.',
    introEn: 'Created with status "new". Fill in the rest from settings later.',
    prefill: ['name'],
    select: 'id, name, brand, sku_size_g, gtin',
    fields: [
      { key: 'name', fr: 'Nom du produit', en: 'Product name', type: 'text', required: true, wide: true },
      { key: 'brand', fr: 'Marque', en: 'Brand', type: 'text' },
      { key: 'product_type', fr: 'Type', en: 'Type', type: 'text' },
      { key: 'material_id', fr: 'Matière', en: 'Material', type: 'fk', list: 'materials' },
      { key: 'sku_size_g', fr: 'Format (g)', en: 'SKU size (g)', type: 'number', step: '0.001' },
      { key: 'gtin', fr: 'GTIN', en: 'GTIN', type: 'text' },
      { key: 'case_gtin', fr: 'GTIN de caisse', en: 'Case GTIN', type: 'text' },
      { key: 'units_per_case', fr: 'Unités par caisse', en: 'Units per case', type: 'number', step: '1' },
      { key: 'is_bulk', fr: 'Vrac (sans format)', en: 'Bulk (no SKU size)', type: 'checkbox' },
      { key: 'is_rotational', fr: 'Rotationnel (cultivar sur l’étiquette)', en: 'Rotational (cultivar on label)', type: 'checkbox' },
    ],
  },
  {
    kind: 'customer',
    table: 'ops_customers',
    titleFr: 'Nouveau client',
    titleEn: 'New customer',
    introFr: 'Le type de client détermine ce qui sera obligatoire à l’emballage et à l’expédition.',
    introEn: 'The customer type decides what becomes mandatory at packaging and shipping.',
    prefill: ['name'],
    select: 'id, name, short_code, customer_type, requires_case_gtin, default_excise_province, payment_terms',
    fields: [
      { key: 'name', fr: 'Nom', en: 'Name', type: 'text', required: true, wide: true },
      { key: 'customer_type', fr: 'Type de client', en: 'Customer type', type: 'select', required: true, wide: true, options: CUSTOMER_TYPES },
      { key: 'short_code', fr: 'Code court', en: 'Short code', type: 'text' },
      { key: 'default_excise_province', fr: 'Province d’accise', en: 'Excise province', type: 'select', options: PROVINCE_OPTIONS },
      { key: 'payment_terms', fr: 'Conditions de paiement', en: 'Payment terms', type: 'text' },
      { key: 'contact_name', fr: 'Contact', en: 'Contact', type: 'text' },
      { key: 'contact_email', fr: 'Courriel du contact', en: 'Contact email', type: 'email' },
      { key: 'requires_case_gtin', fr: 'GTIN de caisse requis', en: 'Case GTIN required', type: 'checkbox' },
    ],
  },
  {
    kind: 'supplier',
    table: 'ops_suppliers',
    titleFr: 'Nouveau fournisseur',
    titleEn: 'New supplier',
    introFr: 'De qui la matière provient : producteurs de trim, fournisseurs de distillat et d’isolat, emballage.',
    introEn: 'Where material comes in from: trim growers, distillate and isolate vendors, packaging.',
    prefill: ['name'],
    select: 'id, name, short_code, licence_no, contact_name',
    fields: [
      { key: 'name', fr: 'Nom', en: 'Name', type: 'text', required: true, wide: true },
      { key: 'short_code', fr: 'Code court', en: 'Short code', type: 'text' },
      { key: 'licence_no', fr: 'N° de licence', en: 'Licence no.', type: 'text' },
      { key: 'contact_name', fr: 'Contact', en: 'Contact', type: 'text' },
      { key: 'contact_email', fr: 'Courriel du contact', en: 'Contact email', type: 'email' },
      { key: 'notes', fr: 'Notes', en: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    kind: 'material',
    table: 'ops_materials',
    titleFr: 'Nouvelle matière',
    titleEn: 'New material',
    introFr: 'Une matière est ce dont un lot est fait. Le code sert à générer les numéros de lot.',
    introEn: 'A material is what a lot is made of. The code is what lot numbers are generated from.',
    prefill: ['name_fr', 'name_en'],
    select: 'id, code, name_fr, name_en, category, tracks_potency',
    fields: [
      { key: 'code', fr: 'Code', en: 'Code', type: 'text', required: true },
      { key: 'category', fr: 'Catégorie', en: 'Category', type: 'select', required: true, options: MATERIAL_CATEGORIES },
      { key: 'name_fr', fr: 'Nom (FR)', en: 'Name (FR)', type: 'text', required: true },
      { key: 'name_en', fr: 'Nom (EN)', en: 'Name (EN)', type: 'text', required: true },
      { key: 'is_cannabis', fr: 'Cannabis', en: 'Cannabis', type: 'checkbox', default: true },
      { key: 'tracks_potency', fr: 'Suivi de la puissance', en: 'Tracks potency', type: 'checkbox', default: true },
      { key: 'notes', fr: 'Notes', en: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    kind: 'room',
    table: 'ops_rooms',
    titleFr: 'Nouvelle salle',
    titleEn: 'New room',
    introFr: 'La couleur est celle qui identifie la salle dans le Gantt et le calendrier.',
    introEn: 'The colour is what identifies this room on the Gantt and the calendar.',
    prefill: ['name_fr', 'name_en'],
    select: 'id, code, name_fr, name_en, colour, allows_concurrent',
    fields: [
      { key: 'code', fr: 'Code', en: 'Code', type: 'text', required: true },
      { key: 'colour', fr: 'Couleur', en: 'Colour', type: 'colour', required: true },
      { key: 'name_fr', fr: 'Nom (FR)', en: 'Name (FR)', type: 'text', required: true },
      { key: 'name_en', fr: 'Nom (EN)', en: 'Name (EN)', type: 'text', required: true },
      { key: 'sort_order', fr: 'Ordre', en: 'Sort order', type: 'number', step: '1' },
      { key: 'allows_concurrent', fr: 'Étapes simultanées permises', en: 'Concurrent stages allowed', type: 'checkbox' },
    ],
  },
  {
    kind: 'process',
    table: 'ops_process_types',
    titleFr: 'Nouveau procédé',
    titleEn: 'New process',
    introFr: 'Le rendement et la durée par défaut servent à pré-remplir le plan de production.',
    introEn: 'The default yield and duration are what the production plan is prefilled from.',
    prefill: ['name_fr', 'name_en'],
    select: 'id, code, name_fr, name_en, kind, room_id, output_material_id, default_yield_pct, default_duration_days, is_formulation',
    fields: [
      { key: 'code', fr: 'Code', en: 'Code', type: 'text', required: true },
      { key: 'kind', fr: 'Genre', en: 'Kind', type: 'select', required: true, options: PROCESS_KINDS },
      { key: 'name_fr', fr: 'Nom (FR)', en: 'Name (FR)', type: 'text', required: true },
      { key: 'name_en', fr: 'Nom (EN)', en: 'Name (EN)', type: 'text', required: true },
      { key: 'room_id', fr: 'Salle', en: 'Room', type: 'fk', list: 'rooms' },
      { key: 'input_material_id', fr: 'Matière entrante', en: 'Input material', type: 'fk', list: 'materials' },
      { key: 'output_material_id', fr: 'Matière sortante', en: 'Output material', type: 'fk', list: 'materials' },
      { key: 'default_yield_pct', fr: 'Rendement par défaut (%)', en: 'Default yield (%)', type: 'number', step: '0.01' },
      { key: 'default_duration_days', fr: 'Durée par défaut (jours)', en: 'Default duration (days)', type: 'number', step: '0.5' },
      { key: 'is_formulation', fr: 'Formulation (plusieurs intrants)', en: 'Formulation (several inputs)', type: 'checkbox' },
    ],
  },
];

export function quickSpec(kind: string): QuickSpec | undefined {
  return QUICK_SPECS.find((s) => s.kind === kind);
}

/** What the combobox shows: a label to match on, and a muted note on the right. */
export interface ComboRow {
  id: string;
  label: string;
  meta: string;
  [k: string]: unknown;
}

/**
 * Shape one database row for the combobox. Used server-side to seed a page and
 * again by the API after an insert, so a freshly created row looks identical to
 * one that was already there.
 */
export function comboRow(kind: string, r: any, locale: string): ComboRow {
  const en = locale === 'en';
  switch (kind) {
    case 'product':
      return {
        ...r, id: r.id, label: r.name,
        meta: [r.brand, r.sku_size_g ? `${r.sku_size_g} g` : null].filter(Boolean).join(' · '),
      };
    case 'customer':
      return { ...r, id: r.id, label: r.name, meta: r.short_code ?? '' };
    case 'supplier':
      return { ...r, id: r.id, label: r.name, meta: r.short_code ?? r.licence_no ?? '' };
    case 'material':
      return { ...r, id: r.id, label: en ? r.name_en : r.name_fr, meta: r.code };
    case 'room':
      return { ...r, id: r.id, label: en ? r.name_en : r.name_fr, meta: r.code };
    case 'process':
      return { ...r, id: r.id, label: en ? r.name_en : r.name_fr, meta: r.code };
    default:
      return { ...r, id: r.id, label: r.name ?? r.code ?? '', meta: '' };
  }
}

export function comboRows(kind: string, rows: any[] | null | undefined, locale: string): ComboRow[] {
  return (rows ?? []).map((r) => comboRow(kind, r, locale));
}
