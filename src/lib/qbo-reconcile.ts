// Portal ↔ QuickBooks comparison for one supplier: open portal invoices next
// to open QB bills / vendor credits, matched by link (qbo_bill_id) then by
// invoice number. Used by Paiements → QuickBooks → Écarts to explain and fix
// a balance mismatch line by line.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getQbo, qstr, type Qbo } from './qbo';
import { n, round2 } from './payables';

export type RecStatus = 'ok' | 'amount' | 'portal_only' | 'qb_only' | 'qb_closed';

export interface RecLine {
  key: string;
  number: string | null;
  date: string | null;
  status: RecStatus;
  /** Open amount in the portal (negative for credits); null when absent. */
  portal: number | null;
  /** Open amount in QB (negative for vendor credits); null when absent. */
  qb: number | null;
  diff: number;
  invoice?: { id: string; kind: string; source: string; amount: number; description: string | null; qbo_bill_id: string | null };
  qbDoc?: { id: string; type: 'Bill' | 'VendorCredit'; total: number; balance: number; note: string | null };
}

export interface RecResult {
  supplier: { id: string; name: string; qbo_vendor_id: string | null };
  vendor: { id: string; name: string; balance: number } | null;
  portalOwed: number;
  qbBalance: number | null;
  diff: number | null;
  lines: RecLine[];
  /** QB balance not explained by open bills/credits (journal entries, unapplied payments…). */
  qbOther: number;
}

export const docKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '');

export async function queryVendorDocs(qbo: Qbo, entity: 'Bill' | 'VendorCredit', vendorId: string) {
  // VendorRef is filterable on Bill; for VendorCredit some companies reject it, so fall back to a scan.
  try {
    return await qbo.query(entity, `VendorRef = ${qstr(vendorId)}`);
  } catch {
    return (await qbo.query(entity)).filter((d) => d.VendorRef?.value === vendorId);
  }
}

export async function compareSupplier(admin: SupabaseClient, supplierId: string): Promise<RecResult | null> {
  const { data: s } = await admin.from('ap_suppliers').select('id, name, qbo_vendor_id').eq('id', supplierId).maybeSingle();
  if (!s) return null;
  const [{ data: bal }, { data: invs }] = await Promise.all([
    admin.from('ap_supplier_balances').select('owed').eq('supplier_id', s.id).maybeSingle(),
    admin.from('ap_invoice_balances')
      .select('id, kind, source, invoice_number, invoice_date, amount, open_amount, description, qbo_bill_id')
      .eq('supplier_id', s.id),
  ]);
  const portalOwed = n(bal?.owed);
  const base: RecResult = { supplier: s, vendor: null, portalOwed, qbBalance: null, diff: null, lines: [], qbOther: 0 };
  if (!s.qbo_vendor_id) return base;

  const qbo = await getQbo(admin);
  if (!qbo) return base;
  const [vendor] = await qbo.query('Vendor', `Id = ${qstr(s.qbo_vendor_id)}`);
  const [bills, credits] = await Promise.all([
    queryVendorDocs(qbo, 'Bill', s.qbo_vendor_id),
    queryVendorDocs(qbo, 'VendorCredit', s.qbo_vendor_id),
  ]);
  const docs = [
    ...bills.map((b) => ({ id: String(b.Id), type: 'Bill' as const, number: b.DocNumber ?? null, date: b.TxnDate ?? null, total: n(b.TotalAmt), balance: n(b.Balance), note: b.PrivateNote ?? b.Line?.[0]?.Description ?? null })),
    ...credits.map((c) => ({ id: String(c.Id), type: 'VendorCredit' as const, number: c.DocNumber ?? null, date: c.TxnDate ?? null, total: -n(c.TotalAmt), balance: -n(c.Balance), note: c.PrivateNote ?? c.Line?.[0]?.Description ?? null })),
  ];
  const docById = new Map(docs.map((d) => [d.id, d]));
  const used = new Set<string>();
  const lines: RecLine[] = [];

  const open = (invs ?? []).filter((i) => Math.abs(n(i.open_amount)) >= 0.005);
  for (const i of open) {
    let d = i.qbo_bill_id ? docById.get(String(i.qbo_bill_id)) : undefined;
    if (!d && i.invoice_number) {
      d = docs.find((x) => !used.has(x.id) && docKey(x.number) && docKey(x.number) === docKey(i.invoice_number) && Math.sign(x.total) === Math.sign(n(i.amount)));
    }
    if (d) used.add(d.id);
    const portal = round2(n(i.open_amount));
    const qb = d ? round2(d.balance) : null;
    const status: RecStatus = !d ? 'portal_only' : Math.abs(d.balance) < 0.005 ? 'qb_closed' : Math.abs(portal - d.balance) < 0.01 ? 'ok' : 'amount';
    lines.push({
      key: i.id, number: i.invoice_number, date: i.invoice_date, status, portal, qb, diff: round2(portal - (qb ?? 0)),
      invoice: { id: i.id, kind: i.kind, source: i.source, amount: n(i.amount), description: i.description, qbo_bill_id: i.qbo_bill_id },
      qbDoc: d ? { id: d.id, type: d.type, total: d.total, balance: d.balance, note: d.note } : undefined,
    });
  }
  for (const d of docs) {
    if (used.has(d.id) || Math.abs(d.balance) < 0.005) continue;
    lines.push({
      key: `qb-${d.id}`, number: d.number, date: d.date, status: 'qb_only', portal: null, qb: round2(d.balance), diff: round2(-d.balance),
      qbDoc: { id: d.id, type: d.type, total: d.total, balance: d.balance, note: d.note },
    });
  }
  const order: Record<RecStatus, number> = { amount: 0, qb_only: 1, portal_only: 2, qb_closed: 3, ok: 4 };
  lines.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.diff) - Math.abs(a.diff));

  const qbBalance = vendor ? n(vendor.Balance) : null;
  const openQb = docs.reduce((t, d) => t + d.balance, 0);
  return {
    ...base,
    vendor: vendor ? { id: String(vendor.Id), name: vendor.DisplayName, balance: n(vendor.Balance) } : null,
    qbBalance,
    diff: qbBalance === null ? null : round2(portalOwed - qbBalance),
    lines,
    qbOther: qbBalance === null ? 0 : round2(qbBalance - openQb),
  };
}

/** Fetch one QB bill or vendor credit (fresh) for an import. */
export async function fetchQbDoc(admin: SupabaseClient, type: 'Bill' | 'VendorCredit', id: string) {
  const qbo = await getQbo(admin);
  if (!qbo) throw new Error('QuickBooks non connecté');
  const res = await qbo.get(`/${type.toLowerCase()}/${encodeURIComponent(id)}`);
  return res?.[type] ?? null;
}

/** Deep link to a QB transaction or vendor in the QuickBooks web app. */
export function qbAppUrl(kind: 'Bill' | 'VendorCredit' | 'Vendor', id: string, env: string | undefined) {
  const host = env === 'production' ? 'https://qbo.intuit.com' : 'https://sandbox.qbo.intuit.com';
  if (kind === 'Vendor') return `${host}/app/vendordetail?nameId=${encodeURIComponent(id)}`;
  return `${host}/app/${kind === 'Bill' ? 'bill' : 'vendorcredit'}?txnId=${encodeURIComponent(id)}`;
}
