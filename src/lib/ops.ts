// Atelier — shared types and the reference-data ("settings") table specs.
//
// The five settings screens are driven from ONE declarative spec each, so a new
// reference table or a new column is a spec change rather than a new page plus a
// new API route. `/portail/atelier/parametres/[table]` renders from the spec and
// `/api/portail/atelier/ref/[table]` validates against the same spec — the list
// of writable columns therefore cannot drift between the form and the endpoint.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortailLocale } from './portail-i18n';

export type OpsRole =
  | 'ceo' | 'sales' | 'production_manager' | 'production' | 'qa' | 'shipping' | 'admin';

/** Roles allowed to edit reference data. Mirrors ops_can_manage() in the database —
 *  the database is the enforcement point; this only decides what the UI offers. */
export const MANAGE_ROLES: OpsRole[] = ['admin', 'production_manager'];

export function canManage(role: OpsRole | null | undefined): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

export interface OpsStaff {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  ops_role: OpsRole | null;
}

/** Resolve the signed-in staff row including their Atelier role. */
export async function currentOpsStaff(supabase: SupabaseClient): Promise<OpsStaff | null> {
  const { data: userResult } = await supabase.auth.getUser();
  const email = userResult.user?.email;
  if (!email) return null;
  const { data } = await supabase
    .from('staff')
    .select('id, full_name, email, title, ops_role')
    .eq('email', email)
    .maybeSingle();
  return (data as OpsStaff) ?? null;
}

// ------------------------------------------------------------------
// Field + table specs
// ------------------------------------------------------------------

export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'colour' | 'fk';

export interface SelectOption {
  value: string;
  fr: string;
  en: string;
}

export interface FieldSpec {
  key: string;
  fr: string;
  en: string;
  type: FieldType;
  required?: boolean;
  /** Show this column in the list view. */
  inList?: boolean;
  options?: SelectOption[];
  /** For type 'fk': the table to read options from. Always `id` + `labelCol`. */
  fkTable?: string;
  fkLabel?: string;
  /** Numeric input step, e.g. '0.01'. */
  step?: string;
  hintFr?: string;
  hintEn?: string;
  /** Rendered but never submitted — for values the database derives. */
  readOnly?: boolean;
}

export interface RefTableSpec {
  slug: string;
  table: string;
  fr: string;
  en: string;
  descFr: string;
  descEn: string;
  orderBy: string;
  ascending?: boolean;
  /** Column used as the row heading in the list. */
  titleField: string;
  fields: FieldSpec[];
  allowCreate: boolean;
  allowDelete: boolean;
  /** Optional free-text search across these columns. */
  searchFields?: string[];
}

const YES_NO_NOTE = {
  hintFr: 'Coché = oui.',
  hintEn: 'Checked = yes.',
};

export const REF_TABLES: RefTableSpec[] = [
  // ---------------------------------------------------------------- rooms
  {
    slug: 'salles',
    table: 'ops_rooms',
    fr: 'Salles',
    en: 'Rooms',
    descFr:
      'Chaque procédé se déroule dans une salle. La couleur suit le procédé partout — Kanban, calendrier, Gantt. Deux étapes qui se chevauchent dans une salle non concurrente déclenchent un avertissement, jamais un blocage.',
    descEn:
      'Every process runs in a room. The colour follows it everywhere — Kanban, calendar, Gantt. Two stages overlapping in a non-concurrent room raise an advisory, never a block.',
    orderBy: 'sort_order',
    ascending: true,
    titleField: 'code',
    allowCreate: true,
    allowDelete: false,
    fields: [
      { key: 'code', fr: 'Code', en: 'Code', type: 'text', required: true, inList: true },
      { key: 'name_fr', fr: 'Nom (FR)', en: 'Name (FR)', type: 'text', required: true, inList: true },
      { key: 'name_en', fr: 'Nom (EN)', en: 'Name (EN)', type: 'text', required: true, inList: true },
      { key: 'colour', fr: 'Couleur', en: 'Colour', type: 'colour', required: true, inList: true },
      {
        key: 'allows_concurrent',
        fr: 'Étapes simultanées permises',
        en: 'Concurrent stages allowed',
        type: 'boolean',
        inList: true,
        hintFr: 'Salle C : séchage et pressage tournent ensemble — aucun avertissement.',
        hintEn: 'Room C: drying and pressing run together — no advisory.',
      },
      { key: 'sort_order', fr: 'Ordre', en: 'Sort order', type: 'number' },
      { key: 'is_active', fr: 'Active', en: 'Active', type: 'boolean' },
    ],
  },

  // ------------------------------------------------------------- processes
  {
    slug: 'procedes',
    table: 'ops_process_types',
    fr: 'Procédés',
    en: 'Processes',
    descFr:
      'Le catalogue des étapes de production. Les rendements et durées servent de valeurs par défaut lors de la planification — ils restent modifiables étape par étape.',
    descEn:
      'The catalogue of production stages. Yields and durations are defaults applied when planning — they stay editable stage by stage.',
    orderBy: 'sort_order',
    ascending: true,
    titleField: 'name_fr',
    allowCreate: true,
    allowDelete: false,
    fields: [
      { key: 'code', fr: 'Code', en: 'Code', type: 'text', required: true, inList: true },
      { key: 'name_fr', fr: 'Nom (FR)', en: 'Name (FR)', type: 'text', required: true, inList: true },
      { key: 'name_en', fr: 'Nom (EN)', en: 'Name (EN)', type: 'text', required: true },
      {
        key: 'kind',
        fr: 'Type',
        en: 'Kind',
        type: 'select',
        required: true,
        inList: true,
        options: [
          { value: 'extraction', fr: 'Extraction', en: 'Extraction' },
          { value: 'drying', fr: 'Séchage', en: 'Drying' },
          { value: 'formulation', fr: 'Formulation', en: 'Formulation' },
          { value: 'pressing', fr: 'Pressage', en: 'Pressing' },
          { value: 'packaging', fr: 'Emballage', en: 'Packaging' },
          { value: 'other', fr: 'Autre', en: 'Other' },
        ],
      },
      { key: 'room_id', fr: 'Salle', en: 'Room', type: 'fk', fkTable: 'ops_rooms', fkLabel: 'code', inList: true },
      { key: 'input_material_id', fr: 'Matière entrante', en: 'Input material', type: 'fk', fkTable: 'ops_materials', fkLabel: 'code' },
      { key: 'output_material_id', fr: 'Matière sortante', en: 'Output material', type: 'fk', fkTable: 'ops_materials', fkLabel: 'code' },
      {
        key: 'default_yield_pct',
        fr: 'Rendement moyen (%)',
        en: 'Average yield (%)',
        type: 'number',
        step: '0.01',
        inList: true,
        hintFr: 'Kief 20 %, IWE 10 %, rosin 60 %. Laisser vide si sans objet.',
        hintEn: 'Kief 20%, IWE 10%, rosin 60%. Leave blank if not applicable.',
      },
      { key: 'default_duration_days', fr: 'Durée par défaut (jours)', en: 'Default duration (days)', type: 'number', step: '0.5', inList: true },
      {
        key: 'is_formulation',
        fr: 'Formulation (plusieurs lots entrants)',
        en: 'Formulation (multiple input lots)',
        type: 'boolean',
        inList: true,
        hintFr: 'Permet de fusionner plusieurs lots et d’ajouter distillat ou isolat.',
        hintEn: 'Allows merging several lots and adding distillate or isolate.',
      },
      { key: 'sort_order', fr: 'Ordre', en: 'Sort order', type: 'number' },
      { key: 'is_active', fr: 'Actif', en: 'Active', type: 'boolean' },
    ],
  },

  // ------------------------------------------------------------- materials
  {
    slug: 'matieres',
    table: 'ops_materials',
    fr: 'Matières',
    en: 'Materials',
    descFr:
      'Ce dont un lot est fait. Le distillat et l’isolat sont des matières à part entière, pas des cas particuliers — ce sont des intrants de formulation courants.',
    descEn:
      'What a lot is made of. Distillate and isolate are first-class materials, not special cases — they are routine formulation inputs.',
    orderBy: 'code',
    ascending: true,
    titleField: 'code',
    allowCreate: true,
    allowDelete: false,
    searchFields: ['code', 'name_fr', 'name_en'],
    fields: [
      { key: 'code', fr: 'Code', en: 'Code', type: 'text', required: true, inList: true },
      { key: 'name_fr', fr: 'Nom (FR)', en: 'Name (FR)', type: 'text', required: true, inList: true },
      { key: 'name_en', fr: 'Nom (EN)', en: 'Name (EN)', type: 'text', required: true, inList: true },
      {
        key: 'category',
        fr: 'Catégorie',
        en: 'Category',
        type: 'select',
        required: true,
        inList: true,
        options: [
          { value: 'cannabis_raw', fr: 'Cannabis — brut', en: 'Cannabis — raw' },
          { value: 'cannabis_intermediate', fr: 'Cannabis — intermédiaire', en: 'Cannabis — intermediate' },
          { value: 'cannabis_finished', fr: 'Cannabis — fini', en: 'Cannabis — finished' },
          { value: 'additive', fr: 'Additif', en: 'Additive' },
          { value: 'packaging', fr: 'Emballage', en: 'Packaging' },
          { value: 'other', fr: 'Autre', en: 'Other' },
        ],
      },
      {
        // Which line of the CRA B300 this material reports on. Distinct from
        // `category`, which is how Oaziz thinks about material internally — and
        // the reason a wrong value here makes every figure it feeds wrong.
        key: 'excise_class',
        fr: 'Classe d’accise (B300)',
        en: 'Excise class (B300)',
        type: 'select',
        required: true,
        inList: true,
        options: [
          { value: 'flowering', fr: 'Matière florifère (kg)', en: 'Flowering material (kg)' },
          { value: 'non_flowering', fr: 'Matière non florifère (kg)', en: 'Non-flowering material (kg)' },
          { value: 'pure_intermediate', fr: 'Intermédiaires purs (kg)', en: 'Pure intermediates (kg)' },
          { value: 'finished_extract', fr: 'Extraits finis (mg THC total)', en: 'Finished extracts (mg total THC)' },
          { value: 'finished_edible', fr: 'Comestibles finis (mg THC total)', en: 'Finished edibles (mg total THC)' },
          { value: 'finished_topical', fr: 'Topiques finis (mg THC total)', en: 'Finished topicals (mg total THC)' },
          { value: 'whole_plant', fr: 'Plante entière (unités)', en: 'Whole plant (units)' },
          { value: 'vegetative_plant', fr: 'Plante végétative (unités)', en: 'Vegetative plant (units)' },
          { value: 'viable_seed', fr: 'Semence viable (unités)', en: 'Viable seed (units)' },
          { value: 'not_cannabis', fr: 'Non déclarable', en: 'Not reportable' },
        ],
      },
      { key: 'is_cannabis', fr: 'Cannabis', en: 'Cannabis', type: 'boolean', inList: true, ...YES_NO_NOTE },
      { key: 'tracks_potency', fr: 'Suivi de la puissance', en: 'Tracks potency', type: 'boolean', inList: true },
      { key: 'default_uom', fr: 'Unité par défaut', en: 'Default unit', type: 'text' },
      { key: 'notes', fr: 'Notes', en: 'Notes', type: 'textarea' },
      { key: 'is_active', fr: 'Active', en: 'Active', type: 'boolean' },
    ],
  },

  // -------------------------------------------------------------- products
  {
    slug: 'produits',
    table: 'ops_products',
    fr: 'Produits (SKU)',
    en: 'Products (SKU)',
    descFr:
      'Importé du tableau monday « SKU List » le 2 septembre 2026. Le GTIN de caisse, les unités par caisse et la province de timbre d’accise sont à compléter — ce sont exactement les champs qui manquent au moment des runs d’emballage.',
    descEn:
      'Imported from the monday “SKU List” board on 2 September 2026. Case GTIN, units per case and excise province still need filling in — precisely the fields that go missing at packaging time.',
    orderBy: 'brand',
    ascending: true,
    titleField: 'name',
    allowCreate: true,
    allowDelete: true,
    searchFields: ['name', 'brand', 'gtin', 'platforms', 'platform_refs'],
    fields: [
      { key: 'name', fr: 'Nom du produit', en: 'Product name', type: 'text', required: true, inList: true },
      { key: 'brand', fr: 'Marque', en: 'Brand', type: 'text', inList: true },
      { key: 'product_type', fr: 'Type', en: 'Type', type: 'text', inList: true },
      { key: 'material_id', fr: 'Matière', en: 'Material', type: 'fk', fkTable: 'ops_materials', fkLabel: 'code', inList: true },
      { key: 'sku_size_g', fr: 'Format (g)', en: 'SKU size (g)', type: 'number', step: '0.001', inList: true,
        hintFr: 'Vide pour le vrac et pour les formats en ml.', hintEn: 'Blank for bulk and for ml formats.' },
      { key: 'is_bulk', fr: 'Vrac', en: 'Bulk', type: 'boolean' },
      { key: 'gtin', fr: 'GTIN', en: 'GTIN', type: 'text', inList: true },
      { key: 'case_gtin', fr: 'GTIN de caisse', en: 'Case GTIN', type: 'text',
        hintFr: 'Obligatoire pour la SQDC et l’OCS.', hintEn: 'Required for SQDC and OCS.' },
      { key: 'units_per_case', fr: 'Unités par caisse', en: 'Units per case', type: 'number' },
      { key: 'requires_excise', fr: 'Timbre d’accise requis', en: 'Excise stamp required', type: 'boolean' },
      { key: 'is_rotational', fr: 'Rotationnel (cultivar sur l’étiquette)', en: 'Rotational (cultivar on label)', type: 'boolean' },
      {
        key: 'status',
        fr: 'Statut',
        en: 'Status',
        type: 'select',
        inList: true,
        options: [
          { value: 'active', fr: 'Actif', en: 'Active' },
          { value: 'new', fr: 'Nouveau', en: 'New' },
          { value: 'delisted', fr: 'Retiré', en: 'Delisted' },
          { value: 'not_listed', fr: 'Non listé', en: 'Not listed' },
        ],
      },
      { key: 'platforms', fr: 'Plateformes / marchés', en: 'Platforms / markets', type: 'text' },
      { key: 'platform_refs', fr: 'Références par plateforme', en: 'Per-platform references', type: 'textarea' },
      { key: 'notes', fr: 'Notes', en: 'Notes', type: 'textarea' },
    ],
  },

  // ------------------------------------------------------------- customers
  {
    slug: 'clients',
    table: 'ops_customers',
    fr: 'Clients',
    en: 'Customers',
    descFr:
      'Le type de client détermine les champs obligatoires plus loin dans le processus : un distributeur provincial rend le GTIN de caisse et les unités par caisse obligatoires sur chaque run d’emballage.',
    descEn:
      'Customer type drives which fields become mandatory later: a provincial distributor makes case GTIN and units per case required on every packaging run.',
    orderBy: 'name',
    ascending: true,
    titleField: 'name',
    allowCreate: true,
    allowDelete: true,
    searchFields: ['name', 'short_code', 'contact_name', 'contact_email'],
    fields: [
      { key: 'name', fr: 'Nom', en: 'Name', type: 'text', required: true, inList: true },
      { key: 'short_code', fr: 'Code court', en: 'Short code', type: 'text', inList: true },
      {
        key: 'customer_type',
        fr: 'Type',
        en: 'Type',
        type: 'select',
        required: true,
        inList: true,
        options: [
          { value: 'provincial_distributor', fr: 'Distributeur provincial', en: 'Provincial distributor' },
          { value: 'medical_platform', fr: 'Plateforme médicale', en: 'Medical platform' },
          { value: 'domestic_b2b', fr: 'B2B domestique', en: 'Domestic B2B' },
          { value: 'export', fr: 'Export', en: 'Export' },
          { value: 'internal', fr: 'Interne', en: 'Internal' },
        ],
      },
      { key: 'requires_case_gtin', fr: 'GTIN de caisse requis', en: 'Case GTIN required', type: 'boolean', inList: true },
      { key: 'default_excise_province', fr: 'Province d’accise par défaut', en: 'Default excise province', type: 'text', inList: true },
      { key: 'payment_terms', fr: 'Conditions de paiement', en: 'Payment terms', type: 'text' },
      { key: 'contact_name', fr: 'Contact', en: 'Contact', type: 'text' },
      { key: 'contact_email', fr: 'Courriel du contact', en: 'Contact email', type: 'text' },
      { key: 'notes', fr: 'Notes', en: 'Notes', type: 'textarea' },
      { key: 'is_active', fr: 'Actif', en: 'Active', type: 'boolean' },
    ],
  },
];

export function findRefTable(slug: string): RefTableSpec | undefined {
  return REF_TABLES.find((t) => t.slug === slug);
}

export function fieldLabel(f: FieldSpec, locale: PortailLocale): string {
  return locale === 'en' ? f.en : f.fr;
}

export function tableLabel(t: RefTableSpec, locale: PortailLocale): string {
  return locale === 'en' ? t.en : t.fr;
}

export function tableDesc(t: RefTableSpec, locale: PortailLocale): string {
  return locale === 'en' ? t.descEn : t.descFr;
}

export function optionLabel(o: SelectOption, locale: PortailLocale): string {
  return locale === 'en' ? o.en : o.fr;
}

/**
 * Coerce one submitted form value to what the column expects.
 * Returns `undefined` for fields that must not be written.
 */
export function coerceField(f: FieldSpec, form: FormData): unknown | undefined {
  if (f.readOnly) return undefined;

  if (f.type === 'boolean') {
    // Unchecked boxes are simply absent from the payload.
    return form.get(f.key) !== null;
  }

  const raw = form.get(f.key);
  if (raw === null) return undefined;
  const value = String(raw).trim();

  if (value === '') return f.required ? undefined : null;

  if (f.type === 'number') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return value;
}

/** Names of every required field left empty in the payload. */
export function missingRequired(spec: RefTableSpec, form: FormData): string[] {
  return spec.fields
    .filter((f) => f.required && f.type !== 'boolean')
    .filter((f) => String(form.get(f.key) ?? '').trim() === '')
    .map((f) => f.key);
}
