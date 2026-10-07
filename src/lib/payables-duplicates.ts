// Duplicate check for a new supplier invoice, before it is saved: looks in the
// portal and in QuickBooks for the same invoice number, or the same amount
// around the same date, for this supplier (and the same number + amount under
// another supplier, in case the wrong supplier was picked).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getQbo, qstr } from './qbo';
import { n } from './payables';

export interface DupMatch {
  source: 'portal' | 'qb';
  strength: 'exact' | 'likely';
  reason: 'number' | 'amount_date' | 'number_other_supplier';
  number: string | null;
  date: string | null;
  amount: number;
  supplier: string | null;
  /** Portal: invoice id (+ supplier id for the link). QB: Bill / VendorCredit id. */
  id: string;
  supplierId?: string;
  qbType?: 'Bill' | 'VendorCredit';
  /** QB doc already linked to a portal invoice. */
  linked?: boolean;
}

export interface DupQuery {
  supplierId: string | null;
  qboVendorId: string | null;
  number: string | null;
  amount: number | null;
  date: string | null;
  credit: boolean;
}

const WINDOW_DAYS = 45;
export const numKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '');
const sameAmount = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) < 0.01;
const shift = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const near = (a: string | null, b: string | null) =>
  !a || !b || Math.abs(new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) <= WINDOW_DAYS * 86400_000;

export async function findDuplicates(admin: SupabaseClient, q: DupQuery): Promise<{ matches: DupMatch[]; qbChecked: boolean }> {
  const key = numKey(q.number);
  const matches: DupMatch[] = [];
  if (!key && !q.amount) return { matches, qbChecked: false };

  // ---- portal
  if (q.supplierId) {
    const { data: invs } = await admin.from('ap_invoices')
      .select('id, invoice_number, invoice_date, amount, supplier_id, ap_suppliers(name)')
      .eq('supplier_id', q.supplierId).is('voided_at', null).in('kind', ['invoice', 'credit', 'opening_balance']);
    for (const i of invs ?? []) {
      const sup = (i.ap_suppliers as unknown as { name: string } | null)?.name ?? null;
      const base = { source: 'portal' as const, number: i.invoice_number, date: i.invoice_date, amount: n(i.amount), supplier: sup, id: i.id, supplierId: i.supplier_id };
      if (key && numKey(i.invoice_number) === key) matches.push({ ...base, strength: 'exact', reason: 'number' });
      // Same amount around the same date under another number: possible re-issue or typo.
      else if (q.amount && sameAmount(n(i.amount), q.amount) && near(i.invoice_date, q.date)) {
        matches.push({ ...base, strength: 'likely', reason: 'amount_date' });
      }
    }
  }
  if (key && q.amount) {
    // Same number + same amount under another supplier (wrong supplier picked?).
    const { data: others } = await admin.from('ap_invoices')
      .select('id, invoice_number, invoice_date, amount, supplier_id, ap_suppliers(name)')
      .ilike('invoice_number', `%${String(q.number).replace(/[%_]/g, '')}%`).is('voided_at', null).limit(50);
    for (const i of others ?? []) {
      if (i.supplier_id === q.supplierId || numKey(i.invoice_number) !== key || !sameAmount(n(i.amount), q.amount)) continue;
      matches.push({
        source: 'portal', strength: 'likely', reason: 'number_other_supplier', number: i.invoice_number, date: i.invoice_date,
        amount: n(i.amount), supplier: (i.ap_suppliers as unknown as { name: string } | null)?.name ?? null, id: i.id, supplierId: i.supplier_id,
      });
    }
  }

  // ---- QuickBooks
  const qbo = await getQbo(admin).catch(() => null);
  if (!qbo) return { matches, qbChecked: false };
  const entity = q.credit ? 'VendorCredit' : 'Bill';
  const seen = new Set<string>();
  const docs: any[] = [];
  try {
    if (q.number) docs.push(...await qbo.query(entity, `DocNumber = ${qstr(String(q.number).slice(0, 21))}`));
  } catch { /* DocNumber query rejected: rely on the vendor scan below */ }
  if (q.qboVendorId && q.amount) {
    const from = q.date ? shift(q.date, -WINDOW_DAYS) : shift(new Date().toISOString().slice(0, 10), -180);
    const to = q.date ? shift(q.date, WINDOW_DAYS) : shift(new Date().toISOString().slice(0, 10), 1);
    try {
      docs.push(...await qbo.query(entity, `VendorRef = ${qstr(q.qboVendorId)} and TxnDate >= ${qstr(from)} and TxnDate <= ${qstr(to)}`));
    } catch {
      docs.push(...(await qbo.query(entity, `TxnDate >= ${qstr(from)} and TxnDate <= ${qstr(to)}`)).filter((d) => d.VendorRef?.value === q.qboVendorId));
    }
  }
  const ids = [...new Set(docs.map((d) => String(d.Id)))];
  const { data: linkedRows } = ids.length
    ? await admin.from('ap_invoices').select('qbo_bill_id').in('qbo_bill_id', ids).is('voided_at', null)
    : { data: [] };
  const linked = new Set((linkedRows ?? []).map((r) => String(r.qbo_bill_id)));
  for (const d of docs) {
    const id = String(d.Id);
    if (seen.has(id)) continue;
    seen.add(id);
    const sameVendor = !!q.qboVendorId && d.VendorRef?.value === q.qboVendorId;
    const numMatch = !!key && numKey(d.DocNumber) === key;
    const amtMatch = !!q.amount && sameAmount(n(d.TotalAmt), q.amount);
    let strength: DupMatch['strength'] | null = null;
    let reason: DupMatch['reason'] = 'number';
    if (numMatch && (sameVendor || amtMatch)) strength = 'exact';
    else if (numMatch && !q.qboVendorId) { strength = 'likely'; }
    else if (numMatch) { strength = 'likely'; reason = 'number_other_supplier'; }
    else if (sameVendor && amtMatch && near(d.TxnDate ?? null, q.date)) { strength = 'likely'; reason = 'amount_date'; }
    if (!strength) continue;
    matches.push({
      source: 'qb', strength, reason, number: d.DocNumber ?? null, date: d.TxnDate ?? null, amount: n(d.TotalAmt),
      supplier: d.VendorRef?.name ?? null, id, qbType: entity, linked: linked.has(id),
    });
  }
  matches.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'exact' ? -1 : 1));
  return { matches, qbChecked: true };
}
