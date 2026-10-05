// Atelier — order intake types and display helpers, shared by the pages and
// the API routes so labels and validation can't drift between them.

import type { PortailLocale } from './portail-i18n';

export type OrderSource = 'customer_po' | 'internal_refill' | 'packaging_request';

export type OrderStatus =
  | 'draft' | 'submitted' | 'in_production' | 'ready_to_ship' | 'shipped' | 'closed' | 'cancelled';

export type WoStatus = 'awaiting_plan' | 'planned' | 'in_progress' | 'done' | 'cancelled';

export type Uom = 'g' | 'kg' | 'units' | 'ml';

export type Priority = 'low' | 'normal' | 'high' | 'critical';

export type RefillPurpose = 'export' | 'domestic' | 'medical' | 'recreational' | 'oaziz_sku';

type Bi = { fr: string; en: string };

export const ORDER_SOURCES: Record<OrderSource, Bi> = {
  customer_po: { fr: 'Bon de commande client', en: 'Customer PO' },
  internal_refill: { fr: 'Réapprovisionnement interne', en: 'Internal refill' },
  packaging_request: { fr: "Demande d'emballage", en: 'Packaging request' },
};

export const ORDER_STATUSES: Record<OrderStatus, Bi> = {
  draft: { fr: 'Brouillon', en: 'Draft' },
  submitted: { fr: 'Reçue', en: 'Received' },
  in_production: { fr: 'En production', en: 'In production' },
  ready_to_ship: { fr: 'Prête à expédier', en: 'Ready to ship' },
  shipped: { fr: 'Expédiée', en: 'Shipped' },
  closed: { fr: 'Fermée', en: 'Closed' },
  cancelled: { fr: 'Annulée', en: 'Cancelled' },
};

export const WO_STATUSES: Record<WoStatus, Bi> = {
  awaiting_plan: { fr: 'À planifier', en: 'Awaiting plan' },
  planned: { fr: 'Planifié', en: 'Planned' },
  in_progress: { fr: 'En cours', en: 'In progress' },
  done: { fr: 'Terminé', en: 'Done' },
  cancelled: { fr: 'Annulé', en: 'Cancelled' },
};

export const PRIORITIES: Record<Priority, Bi> = {
  low: { fr: 'Basse', en: 'Low' },
  normal: { fr: 'Normale', en: 'Normal' },
  high: { fr: 'Haute', en: 'High' },
  critical: { fr: 'Critique', en: 'Critical' },
};

export const UOMS: Record<Uom, Bi> = {
  g: { fr: 'g', en: 'g' },
  kg: { fr: 'kg', en: 'kg' },
  units: { fr: 'unités', en: 'units' },
  ml: { fr: 'ml', en: 'ml' },
};

export const REFILL_PURPOSES: Record<RefillPurpose, Bi> = {
  export: { fr: 'Export', en: 'Export' },
  domestic: { fr: 'Domestique', en: 'Domestic' },
  medical: { fr: 'Médical', en: 'Medical' },
  recreational: { fr: 'Récréatif', en: 'Recreational' },
  oaziz_sku: { fr: 'SKU Oaziz', en: 'Oaziz SKU' },
};

/** Statuses whose data may still be corrected. A shipped or closed order is a
 *  record of what happened, not a draft. */
export const EDITABLE_STATUSES: OrderStatus[] = ['draft', 'submitted', 'in_production', 'ready_to_ship'];

export const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CHF'] as const;

export const PROVINCES = [
  'QC', 'ON', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU',
] as const;

export const PAYMENT_TERMS_PRESETS = [
  'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Prépayé / Prepaid', 'COD',
] as const;

export function bi(map: Record<string, Bi>, key: string | null | undefined, locale: PortailLocale): string {
  if (!key) return '—';
  const entry = map[key];
  if (!entry) return key;
  return locale === 'en' ? entry.en : entry.fr;
}

/** Colour class for a status pill. Semantic, deliberately not the brand accent. */
export function statusTone(status: OrderStatus): 'neutral' | 'active' | 'good' | 'muted' | 'stop' {
  switch (status) {
    case 'draft': return 'muted';
    case 'submitted': return 'neutral';
    case 'in_production': return 'active';
    case 'ready_to_ship': return 'active';
    case 'shipped':
    case 'closed': return 'good';
    case 'cancelled': return 'stop';
    default: return 'neutral';
  }
}

/** "3 lines · 15 kg" style summary used in lists and in the notification email. */
export function summariseLines(
  lines: Array<{ product_name: string; qty: number; uom: string }>,
  locale: PortailLocale = 'fr',
): string {
  if (lines.length === 0) return locale === 'en' ? 'no lines' : 'aucune ligne';
  if (lines.length === 1) {
    const l = lines[0];
    return `${l.product_name} — ${formatQty(l.qty)} ${l.uom}`;
  }
  const word = locale === 'en' ? 'lines' : 'lignes';
  return `${lines.length} ${word} — ${lines.map((l) => l.product_name).slice(0, 3).join(', ')}${lines.length > 3 ? '…' : ''}`;
}

export function formatQty(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  // Trim trailing zeros: 1500.000 → 1 500
  return v.toLocaleString('fr-CA', { maximumFractionDigits: 3 }).replace(/ /g, ' ');
}

export function formatMoney(n: number | string | null | undefined, currency: string): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).replace(/ /g, ' ')} ${currency}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(iso).toLocaleDateString('fr-CA');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-CA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(/ /g, ' ');
}

// ------------------------------------------------------------------
// One submitted order line, before it reaches the database
// ------------------------------------------------------------------

export interface ParsedLine {
  /** Existing row id when editing; null for a newly added line. */
  id: string | null;
  line_no: number;
  product_id: string | null;
  product_name: string;
  lot_ref: string | null;
  qty: number;
  uom: Uom;
  sku_size_g: number | null;
  unit_price: number | null;
  excise_province: string | null;
  cultivar: string | null;
  notes: string | null;
}

const UOM_VALUES: Uom[] = ['g', 'kg', 'units', 'ml'];

function num(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Read the repeating line inputs (`line_product_name[]`, `line_qty[]`, …) off the
 * intake form. Rows with neither a product name nor a quantity are treated as
 * blank spares and skipped, so an operator can leave extra rows empty.
 */
export function parseLines(form: FormData): { lines: ParsedLine[]; errors: string[] } {
  const names = form.getAll('line_product_name');
  const errors: string[] = [];
  const lines: ParsedLine[] = [];

  for (let i = 0; i < names.length; i++) {
    const productName = str(names[i]);
    const qty = num(form.getAll('line_qty')[i] ?? null);

    if (!productName && qty === null) continue; // untouched spare row

    if (!productName) { errors.push(`line_${i + 1}_product`); continue; }
    if (qty === null || qty <= 0) { errors.push(`line_${i + 1}_qty`); continue; }

    const rawUom = String(form.getAll('line_uom')[i] ?? 'g');
    const uom = (UOM_VALUES as string[]).includes(rawUom) ? (rawUom as Uom) : 'g';

    lines.push({
      id: str(form.getAll('line_id')[i] ?? null),
      line_no: lines.length + 1,
      product_id: str(form.getAll('line_product_id')[i] ?? null),
      product_name: productName,
      lot_ref: str(form.getAll('line_lot_ref')[i] ?? null),
      qty,
      uom,
      sku_size_g: num(form.getAll('line_sku_size_g')[i] ?? null),
      unit_price: num(form.getAll('line_unit_price')[i] ?? null),
      excise_province: str(form.getAll('line_excise_province')[i] ?? null),
      cultivar: str(form.getAll('line_cultivar')[i] ?? null),
      notes: str(form.getAll('line_notes')[i] ?? null),
    });
  }

  if (lines.length === 0 && errors.length === 0) errors.push('no_lines');
  return { lines, errors };
}

/** Fields each intake door insists on before it will accept the order. */
export function requiredFieldsFor(source: OrderSource): string[] {
  switch (source) {
    case 'customer_po':
      return ['customer_id', 'customer_po_ref', 'requested_delivery_date', 'ship_to_text', 'payment_terms'];
    case 'internal_refill':
      return ['requested_delivery_date', 'purpose'];
    case 'packaging_request':
      return ['requested_delivery_date'];
  }
}

export function missingFor(source: OrderSource, form: FormData): string[] {
  return requiredFieldsFor(source).filter((k) => String(form.get(k) ?? '').trim() === '');
}
