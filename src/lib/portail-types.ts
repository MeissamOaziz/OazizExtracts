// Types shared by the signer page and the document components.

export interface StaffLite {
  id: string;
  name: string;
  email?: string;
}

export interface SubmissionForRender {
  id: string;
  form_date: string;
  product_name: string;
  product_type: string;
  quantity: string;
  production_state: 'vrac' | 'emballe' | null;
  production_id: string | null;
  rnd_objective: string | null;
  rnd_quantity_for_test: string | null;
  rnd_lp_number: string | null;
  rnd_qty_destroyed: string | null;
  rnd_date_destroyed: string | null;
  initiator: StaffLite;
  production: StaffLite;
  qa: StaffLite;
  consent_obtainer: StaffLite;
}

export interface DocumentEntry {
  kind: 'sample_request' | 'rnd' | 'consent';
  participant: StaffLite | null;
}

export function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  // Interpret YYYY-MM-DD as a local date to avoid UTC-shift showing the previous day.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Static investigator phone for the consent form (per prototype).
export const INVESTIGATOR_PHONE = '(514) 679-5193';

// Split "20 g" across N participants → "5 g" (or "6.67 g" for 3 participants).
// If the quantity string isn't parseable as a leading number, returns the original.
export function splitQuantity(qty: string | null | undefined, n: number): string {
  if (!qty || n <= 0) return qty ?? '';
  const m = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(qty.trim());
  if (!m) return qty;
  const num = parseFloat(m[1].replace(',', '.'));
  const unit = (m[2] || '').trim();
  if (Number.isNaN(num)) return qty;
  const per = num / n;
  // Trim trailing zeros: 5.00 → 5, 6.666… → 6.67
  const perStr = per.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${perStr} ${unit}` : perStr;
}

// Rating scale used on the R&D form
export type RndRating = 1 | 2 | 3 | 4 | 5;
export interface RndRatings {
  odeur: RndRating | null;
  gout: RndRating | null;
  texture: RndRating | null;
  globale: RndRating | null;
}
export const RATING_KEYS: Array<keyof RndRatings> = ['odeur', 'gout', 'texture', 'globale'];
export const RATING_LABELS: Record<keyof RndRatings, string> = {
  odeur: 'Odeur',
  gout: 'Goût',
  texture: 'Texture',
  globale: 'Évaluation globale',
};
