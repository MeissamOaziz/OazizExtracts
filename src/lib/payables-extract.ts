// Reads a supplier invoice (PDF or photo) with Claude and returns the fields
// needed to enter it in the portal and in QuickBooks, plus the best-matching
// existing suppliers. The person always reviews the result before it is saved.

import Anthropic from '@anthropic-ai/sdk';
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
Extract the fields exactly as printed. Dates as YYYY-MM-DD. Amounts as plain numbers (no currency symbols, dot decimal).
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
  return response.parsed_output;
}

const norm = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(inc|ltd|ltee|limited|corp|corporation|enr|senc|llc|co|qc|quebec|canada)\b\.?/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Best existing-supplier matches for an extracted vendor, by name token overlap. */
export function matchSuppliers(x: InvoiceExtraction, suppliers: SupplierRow[]): Array<{ id: string; name: string; score: number }> {
  const targets = [x.vendor_name, x.vendor_legal_name].filter(Boolean).map((v) => norm(v!));
  const scored = suppliers.map((s) => {
    const names = [s.name, s.legal_name, s.qbo_vendor_name].filter(Boolean).map((v) => norm(v!));
    let best = 0;
    for (const t of targets) {
      const tt = new Set(t.split(' ').filter((w) => w.length > 1));
      for (const nme of names) {
        if (!nme || !t) continue;
        if (nme === t) { best = 1; continue; }
        if (nme.includes(t) || t.includes(nme)) best = Math.max(best, 0.85);
        const nn = new Set(nme.split(' ').filter((w) => w.length > 1));
        const inter = [...tt].filter((w) => nn.has(w)).length;
        const union = new Set([...tt, ...nn]).size || 1;
        best = Math.max(best, inter / union);
      }
    }
    return { id: s.id, name: s.name, score: Math.round(best * 100) / 100 };
  });
  return scored.filter((s) => s.score >= 0.34).sort((a, b) => b.score - a.score).slice(0, 5);
}
