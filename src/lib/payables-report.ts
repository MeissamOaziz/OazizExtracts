// Payments report per bank account and period (Paiements → Rapports): used to
// reconcile a bank statement and to key or upload the transactions into the
// books of an account that isn't connected (e.g. TD MJLB's QuickBooks).

import type { SupabaseClient } from '@supabase/supabase-js';
import { n, round2 } from './payables';

export interface ReportRow {
  id: string;
  /** 'deposit_in': a deposit received from the funding account (negative amount = money in). */
  kind: 'payment' | 'deposit_in';
  paid_on: string;
  supplier: string;
  supplier_id: string;
  account_id: string | null;
  account: string;
  method: string | null;
  reference: string | null;
  amount: number;
  invoices: string[];
  notes: string | null;
  in_qbo: boolean;
  remittance_sent: boolean;
  source: string;
}

export interface ReportFilter { accountId: string | null; from: string; to: string }

export async function loadPaymentReport(admin: SupabaseClient, f: ReportFilter) {
  let q = admin.from('ap_payments')
    .select('id, paid_on, amount, payment_method, reference, notes, source, bank_account_id, qbo_billpayment_id, remittance_sent_at, supplier_id, ap_suppliers(name), ap_bank_accounts!ap_payments_bank_account_id_fkey(name), ap_payment_allocations(amount, ap_invoices(invoice_number, kind))')
    .is('voided_at', null).gte('paid_on', f.from).lte('paid_on', f.to)
    .order('paid_on').order('created_at');
  if (f.accountId === 'none') q = q.is('bank_account_id', null);
  else if (f.accountId) q = q.eq('bank_account_id', f.accountId);
  const { data, error } = await q;
  if (error) throw error;
  const rows: ReportRow[] = (data ?? []).map((p: any) => ({
    kind: 'payment' as const, id: p.id, paid_on: p.paid_on, supplier: p.ap_suppliers?.name ?? '?', supplier_id: p.supplier_id,
    account_id: p.bank_account_id, account: p.ap_bank_accounts?.name ?? '—', method: p.payment_method,
    reference: p.reference || null, amount: n(p.amount), notes: p.notes || null,
    invoices: (p.ap_payment_allocations ?? [])
      .map((a: any) => a.ap_invoices?.invoice_number ?? (a.ap_invoices?.kind === 'opening_balance' ? 'Solde d’ouverture' : null))
      .filter(Boolean),
    in_qbo: !!p.qbo_billpayment_id, remittance_sent: !!p.remittance_sent_at, source: p.source,
  }));
  // Deposits received by a funded account (e.g. RBC → TD MJLB) appear on that account as money in.
  if (f.accountId !== 'none') {
    let dq = admin.from('ap_payments')
      .select('id, paid_on, amount, reference, transfer_to_account_id, supplier_id, ap_suppliers(name), funder:ap_bank_accounts!ap_payments_bank_account_id_fkey(name), dest:ap_bank_accounts!ap_payments_transfer_to_account_id_fkey(name)')
      .is('voided_at', null).not('transfer_to_account_id', 'is', null).gte('paid_on', f.from).lte('paid_on', f.to);
    if (f.accountId) dq = dq.eq('transfer_to_account_id', f.accountId);
    const { data: deps, error: depErr } = await dq;
    if (depErr) throw depErr;
    for (const d of (deps ?? []) as any[]) {
      rows.push({
        kind: 'deposit_in', id: `in-${d.id}`, paid_on: d.paid_on, supplier: d.funder?.name ?? '?', supplier_id: d.supplier_id,
        account_id: d.transfer_to_account_id, account: d.dest?.name ?? '—', method: 'eft', reference: d.reference || null,
        amount: -n(d.amount), invoices: [], notes: null, in_qbo: false, remittance_sent: false, source: 'portal',
      });
    }
    rows.sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  }
  const byAccount = new Map<string, { name: string; count: number; total: number }>();
  for (const r of rows) {
    const k = r.account_id ?? 'none';
    const cur = byAccount.get(k) ?? { name: r.account, count: 0, total: 0 };
    cur.count++; cur.total = round2(cur.total + r.amount);
    byAccount.set(k, cur);
  }
  return { rows, total: round2(rows.reduce((t, r) => t + r.amount, 0)), byAccount: [...byAccount.values()] };
}

/** Default period: the first day of the current month to today. */
export function defaultPeriod() {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Text used as the bank-line description in exports. */
export function describe(r: ReportRow) {
  if (r.kind === 'deposit_in') return [`Dépôt de ${r.supplier}`, r.reference && `Réf ${r.reference}`].filter(Boolean).join(' — ');
  return [r.supplier, r.reference && `Réf ${r.reference}`, r.invoices.length ? `Fact. ${r.invoices.join(', ')}` : null]
    .filter(Boolean).join(' — ');
}
