// Reads a supplier invoice (PDF or photo) with Claude and returns the fields
// needed to enter it in the portal and in QuickBooks, plus the best-matching
// existing suppliers. The person always reviews the result before it is saved.

import Anthropic from '@anthropic-ai/sdk';
import { nameScore } from './name-match';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type { SupplierRow } from './payables';

export const InvoiceExtraction = z.object({
  vendor_name: z.string().describe('Supplier trade name as printed on the invoice'),
  vendor_legal_name: z.string().nullable().describe('Legal / numbered company name if different, e.g. "9406-3385 Québec Inc."'),
  vendor_email: z.string().nullable(),
  vendor_gst_number: z.string().nullable().describe('GST/HST registration number'),
  vendor_qst_number: z.string().nullable().describe('QST (TVQ) registration number'),
  invoice_number: z.string().nullable(),
  po_number: z.string().nullable().describe('Customer PO / purchase order reference, if any'),
  invoice_date: z.string().nullable().describe('YYYY-MM-DD'),
  invoice_date_printed: z.string().nullable().describe('The invoice date exactly as printed, character for character (e.g. "10/09/2026", "9 oct. 2026")'),
  date_order: z.enum(['day_first', 'month_first', 'unknown']).describe('Order of numeric dates on this document, ONLY when the document itself shows it: a format label such as JJ/MM/AAAA, DD/MM/YYYY or MM/DD/YYYY, or another date on the page whose first number is above 12. Otherwise "unknown" — do not guess from the language or country.'),
  due_date: z.string().nullable().describe('YYYY-MM-DD — only if printed or computable from stated terms'),
  payment_terms: z.string().nullable().describe('e.g. "Net 30"'),
  currency: z.enum(['CAD', 'USD', 'EUR', 'OTHER']),
  subtotal: z.number().nullable(),
  gst_hst: z.number().nullable().describe('GST/TPS or HST amount'),
  qst: z.number().nullable().describe('QST/TVQ amount'),
  other_taxes: z.number().nullable().describe('Excise or any other tax/fee lines'),
  total: z.number().describe('Total amount due on this invoice, taxes included'),
  is_credit_note: z.boolean().describe('True if this document is a credit note / refund'),
  description: z.string().describe('One short line describing what was bought (products/services, quantities)'),
  payment_instructions: z.string().nullable().describe('Banking / e-transfer / wire details printed on the invoice'),
});
export type InvoiceExtraction = z.infer<typeof InvoiceExtraction>;

const PROMPT = `You are reading a supplier invoice received by Oaziz Extracts Inc. (a cannabis processor in Montréal) so it can be entered in accounts payable.
Oaziz is the CUSTOMER on this document — never return Oaziz as the vendor.
Extract the fields exactly as printed. Dates as YYYY-MM-DD. Québec/Canadian invoices often print dates as DD/MM/YYYY (12/10/2026 = 12 October 2026): use month names, the due date and the terms to decide, and never read an invoice date that would be months in the future. Amounts as plain numbers (no currency symbols, dot decimal).
If a field is not on the document, return null rather than guessing. "total" is the amount the customer owes for this invoice including taxes.`;

export function extractionAvailable(): boolean {
  return !!import.meta.env.ANTHROPIC_API_KEY;
}

export async function extractInvoice(file: { data: Buffer; mediaType: string }): Promise<InvoiceExtraction> {
  const client = new Anthropic({ apiKey: import.meta.env.ANTHROPIC_API_KEY });
  const b64 = file.data.toString('base64');
  const doc = file.mediaType === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: b64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: file.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: b64 } };

  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(InvoiceExtraction) },
    messages: [{ role: 'user', content: [doc, { type: 'text', text: PROMPT }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Le document n’a pas pu être lu (refus du modèle).');
  if (!response.parsed_output) throw new Error('Lecture incomplète du document.');
  return resolveDates(fixDayMonth(response.parsed_output));
}

export type ExtractionWithDates = InvoiceExtraction & { date_alternative?: string | null };

/**
 * A numeric date where both numbers are 12 or less ("10/09/2026") reads two
 * ways: 10 Sept (day first) or 9 Oct (month first). Suppliers use both orders,
 * so the model guesses wrong at times (Cintas 4285180521: 9 Oct read as
 * 10 Sept). Use the order the document states; otherwise the reading that is
 * not in the future and is closest to today (invoices are entered within days
 * or weeks of their date). The other reading is returned so the form can say so.
 */
export function resolveDates(x: InvoiceExtraction, today = new Date()): ExtractionWithDates {
  const m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\s*$/.exec(x.invoice_date_printed ?? '');
  if (!m) return { ...x, date_alternative: null };
  const a = Number(m[1]), b = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = (mo: number, d: number) => `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const valid = (mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  const dayFirst = valid(b, a) ? iso(b, a) : null;
  const monthFirst = valid(a, b) ? iso(a, b) : null;
  let chosen: string | null;
  if (!dayFirst || !monthFirst || dayFirst === monthFirst) chosen = dayFirst ?? monthFirst;
  else if (x.date_order === 'day_first') chosen = dayFirst;
  else if (x.date_order === 'month_first') chosen = monthFirst;
  else {
    const t = today.getTime();
    const score = (v: string) => {
      const diff = new Date(v + 'T12:00:00').getTime() - t;
      // More than a week ahead is unlikely for an invoice date: rank it after any past reading.
      return Math.abs(diff) + (diff > 7 * 86400_000 ? 1e13 : 0);
    };
    chosen = score(dayFirst) <= score(monthFirst) ? dayFirst : monthFirst;
  }
  if (!chosen) return { ...x, date_alternative: null };
  const ambiguous = !!dayFirst && !!monthFirst && dayFirst !== monthFirst && x.date_order === 'unknown';
  // The due date was read with the same order: keep the same gap (the terms) from the corrected date.
  let due = x.due_date;
  const isIso = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (isIso(x.invoice_date) && x.invoice_date !== chosen && isIso(due)) {
    const gap = new Date(due + 'T12:00:00').getTime() - new Date(x.invoice_date + 'T12:00:00').getTime();
    due = gap >= 0 ? new Date(new Date(chosen + 'T12:00:00').getTime() + gap).toISOString().slice(0, 10) : null;
  }
  if (due && due < chosen) due = null;
  return { ...x, invoice_date: chosen, due_date: due, date_alternative: ambiguous ? (chosen === dayFirst ? monthFirst : dayFirst) : null };
}

/**
 * Canadian invoices often print dates as DD/MM/YYYY ("12/10/2026" = Oct 12).
 * A date read more than 45 days in the future is almost always day and month
 * swapped: when swapping them gives a plausible date, use it (both dates
 * together, so the due date stays consistent).
 */
export function fixDayMonth(x: InvoiceExtraction, today = new Date()): InvoiceExtraction {
  const parse = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const swap = (v: string) => `${v.slice(0, 4)}-${v.slice(8, 10)}-${v.slice(5, 7)}`;
  const limit = new Date(today.getTime() + 45 * 86400_000).toISOString().slice(0, 10);
  const inv = parse(x.invoice_date);
  if (!inv || inv <= limit) return x;
  const day = Number(inv.slice(8, 10));
  if (day > 12) return x;
  const swapped = swap(inv);
  if (swapped > limit) return x;
  const due = parse(x.due_date);
  const dueSwapped = due && Number(due.slice(8, 10)) <= 12 ? swap(due) : due;
  return { ...x, invoice_date: swapped, due_date: dueSwapped && dueSwapped >= swapped ? dueSwapped : due };
}

const norm = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(inc|ltd|ltee|limited|corp|corporation|enr|senc|llc|co|qc|quebec|canada)\b\.?/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const taxNo = (v: string | null | undefined) => (v ?? '').replace(/[^0-9]/g, '').slice(0, 9);

/**
 * Best existing-supplier matches for an extracted vendor. A GST/QST number on
 * file wins outright; otherwise whole-word name overlap against the supplier's
 * name, legal name, QB name and learned aliases ("Canadian Cannabis Exchange"
 * → CCX). Partial words never count ("Cannabis" must not match "BIS").
 */
// Names compared with nameScore (spacing, "A / B", suffixes tolerated).
export function matchSuppliers(x: InvoiceExtraction, suppliers: SupplierRow[]): Array<{ id: string; name: string; score: number }> {
  const gst = taxNo(x.vendor_gst_number);
  const qst = taxNo(x.vendor_qst_number);
  const targets = [x.vendor_name, x.vendor_legal_name].filter((v): v is string => !!v);
  const scored = suppliers.map((s) => {
    if ((gst && taxNo(s.gst_number) === gst) || (qst && taxNo(s.qst_number) === qst)) {
      return { id: s.id, name: s.name, score: 1 };
    }
    const names = [s.name, s.legal_name, s.qbo_vendor_name, ...(s.aliases ?? [])].filter((v): v is string => !!v);
    let best = 0;
    for (const t of targets) for (const nme of names) best = Math.max(best, nameScore(t, nme));
    return { id: s.id, name: s.name, score: Math.round(best * 100) / 100 };
  });
  return scored.filter((s) => s.score >= 0.34).sort((a, b) => b.score - a.score).slice(0, 5);
}
