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
