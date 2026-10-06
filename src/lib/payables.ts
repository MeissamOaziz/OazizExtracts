// Supplier payments ("Paiements") — shared data access and cash math.
//
// Every ap_* table is RLS-closed, so all reads/writes go through the
// service-role client; the 'payables' permission (middleware) is the gate.
// Balances are never stored: they come from the ap_invoice_balances /
// ap_supplier_balances views (invoice amount minus allocated payments).

import type { SupabaseClient } from '@supabase/supabase-js';
import { mintToken, sha256Hex } from './tokens';

export const PAYMENT_METHODS = ['eft', 'wire', 'etransfer', 'prepaid_cc', 'cheque', 'auto_withdrawal', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CATEGORIES = ['supplier', 'service', 'loan', 'tax', 'utility', 'rent', 'employee', 'other'] as const;
export const INVOICE_KINDS = ['invoice', 'credit', 'opening_balance', 'adjustment'] as const;
export const CASH_KINDS = ['balance', 'payroll', 'credit_card', 'loan', 'transfer', 'other'] as const;

export type RunStatus = 'draft' | 'submitted' | 'approved' | 'closed';

/** funded_by: another account that deposits this one's weekly payments in one
 *  transfer first (TD MJLB is funded by RBC). */
export interface BankAccount { id: string; code: string; name: string; sort_order: number; funded_by: string | null }

export interface Supplier {
  id: string; name: string; legal_name: string | null; category: string;
  payment_method: PaymentMethod; bank_account_id: string | null; currency: string;
  terms_days: number | null; payment_details: string | null; notes: string | null;
  contact_name: string | null; contact_email: string | null; remittance_email: string | null;
  qbo_vendor_name: string | null; sheet_tab: string | null; is_active: boolean; sort_order: number;
  aliases: string[]; gst_number: string | null; qst_number: string | null;
}

export interface SupplierBalance {
  supplier_id: string; owed: number; overdue: number; due_7d: number;
  open_count: number; not_in_qbo: number; last_paid_on: string | null;
}

export type SupplierRow = Supplier & { bal: SupplierBalance };

export interface Run {
  id: string; run_date: string; status: RunStatus; notes: string | null;
  submitted_at: string | null; submitted_by: string | null;
  approver_name: string | null; approver_email: string | null;
  token_expires_at: string | null; approved_at: string | null; approved_via: string | null;
  approver_comment: string | null; closed_at: string | null; created_at: string;
}

export interface CashLine {
  id: string; run_id: string; bank_account_id: string; kind: string; label: string;
  amount: number | null; as_of: string | null; note: string | null; sort_order: number;
}

export interface RunLine {
  id: string; run_id: string; supplier_id: string; owed_at_submit: number | null;
  suggested_amount: number | null; suggested_note: string | null;
  approved_amount: number | null; approver_note: string | null;
  payment_id: string | null; processed_at: string | null; remittance_sent_at: string | null;
}

export interface InvoiceBalance {
  id: string; supplier_id: string; kind: string; invoice_number: string | null; po_number: string | null;
  invoice_date: string | null; due_date: string | null; amount: number; description: string | null;
  in_quickbooks: boolean; file_path: string | null; source: string; origin_payment_id: string | null;
  qbo_bill_id: string | null; qbo_error: string | null; subtotal: number | null;
  qbo_account_id: string | null; qbo_tax_code_id: string | null;
  allocated: number; open_amount: number;
  created_at: string;
}

export const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Parses a user-typed amount ("1 234,56", "1,234.56", "$500") → number, or null when blank/invalid. */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? round2(raw) : null;
  let s = String(raw).replace(/[\s$ ]/g, '');
  if (!s) return null;
  // "1.234,56" or "1234,56" → comma is the decimal separator.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const x = Number(s);
  return Number.isFinite(x) ? round2(x) : null;
}

export function money(v: number | null | undefined, locale: 'fr' | 'en' = 'fr'): string {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format(v);
}

export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** The Friday of the current week (payments go to Jorge Friday morning). */
export function upcomingFriday(from = new Date()): string {
  const d = new Date(from);
  const delta = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export async function getSetting<T>(admin: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('ap_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setSetting(admin: SupabaseClient, key: string, value: unknown) {
  await admin.from('ap_settings').upsert({ key, value, updated_at: new Date().toISOString() });
}

export interface ApproverSetting { name: string; email: string }
export interface CashTemplateItem { account: string; kind: string; label: string }

export async function logEvent(
  admin: SupabaseClient,
  e: { run_id?: string | null; supplier_id?: string | null; actor_staff_id?: string | null; actor_label?: string | null; action: string; details?: Record<string, unknown> },
) {
  const { error } = await admin.from('ap_events').insert({ details: {}, ...e });
  if (error) console.error('[payables] event log failed:', error);
}

export async function loadAccounts(admin: SupabaseClient): Promise<BankAccount[]> {
  const { data } = await admin.from('ap_bank_accounts').select('*').order('sort_order');
  return (data ?? []) as BankAccount[];
}

export async function loadSuppliers(admin: SupabaseClient, opts: { includeInactive?: boolean } = {}): Promise<SupplierRow[]> {
  let q = admin.from('ap_suppliers').select('*').order('name');
  if (!opts.includeInactive) q = q.eq('is_active', true);
  const [{ data: sups }, { data: bals }] = await Promise.all([
    q,
    admin.from('ap_supplier_balances').select('*'),
  ]);
  const byId = new Map<string, SupplierBalance>();
  for (const b of bals ?? []) {
    byId.set(b.supplier_id, {
      supplier_id: b.supplier_id, owed: n(b.owed), overdue: n(b.overdue), due_7d: n(b.due_7d),
      open_count: n(b.open_count), not_in_qbo: n(b.not_in_qbo), last_paid_on: b.last_paid_on,
    });
  }
  return ((sups ?? []) as Supplier[]).map((s) => ({
    ...s,
    bal: byId.get(s.id) ?? { supplier_id: s.id, owed: 0, overdue: 0, due_7d: 0, open_count: 0, not_in_qbo: 0, last_paid_on: null },
  }));
}

export async function loadOpenInvoices(admin: SupabaseClient, supplierIds?: string[]): Promise<Map<string, InvoiceBalance[]>> {
  let q = admin.from('ap_invoice_balances').select('*').neq('open_amount', 0)
    .order('invoice_date', { ascending: true, nullsFirst: true });
  if (supplierIds) {
    if (supplierIds.length === 0) return new Map();
    q = q.in('supplier_id', supplierIds);
  }
  const { data } = await q.limit(5000);
  const out = new Map<string, InvoiceBalance[]>();
  for (const r of (data ?? []) as InvoiceBalance[]) {
    r.amount = n(r.amount); r.allocated = n(r.allocated); r.open_amount = n(r.open_amount);
    const list = out.get(r.supplier_id) ?? [];
    list.push(r);
    out.set(r.supplier_id, list);
  }
  return out;
}

export async function loadRun(admin: SupabaseClient, id: string) {
  const [{ data: run }, { data: cash }, { data: lines }] = await Promise.all([
    admin.from('ap_runs').select('*').eq('id', id).maybeSingle(),
    admin.from('ap_run_cash_lines').select('*').eq('run_id', id).order('sort_order'),
    admin.from('ap_run_lines').select('*').eq('run_id', id),
  ]);
  if (!run) return null;
  const numify = <T extends Record<string, unknown>>(r: T, keys: string[]) => {
    for (const k of keys) if (r[k] !== null && r[k] !== undefined) (r as Record<string, unknown>)[k] = n(r[k]);
    return r;
  };
  return {
    run: run as Run,
    cash: ((cash ?? []) as CashLine[]).map((c) => numify(c as unknown as Record<string, unknown>, ['amount']) as unknown as CashLine),
    lines: ((lines ?? []) as RunLine[]).map((l) => numify(l as unknown as Record<string, unknown>,
      ['owed_at_submit', 'suggested_amount', 'approved_amount']) as unknown as RunLine),
  };
}

export async function loadRunByToken(admin: SupabaseClient, rawToken: string) {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return null;
  const { data } = await admin.from('ap_runs').select('id, token_expires_at').eq('token_hash', sha256Hex(rawToken)).maybeSingle();
  if (!data) return null;
  return loadRun(admin, data.id);
}

/** Outflow lines (payroll, credit card, loan) always reduce the balance, whatever sign was typed. */
export const OUTFLOW_KINDS = ['payroll', 'credit_card', 'loan'];
export function cashEffect(kind: string, amount: number | null | undefined): number {
  const v = n(amount);
  return OUTFLOW_KINDS.includes(kind) ? -Math.abs(v) : v;
}

export interface AccountCash {
  account: BankAccount;
  base: number;          // balance + fixed lines (signed)
  balanceMissing: boolean;
  suggested: number;     // supplier payments assigned to this account
  approved: number;
  paid: number;
  /** Funding transfer for this week: sent to the accounts this one funds, or received from its funder. */
  transferSuggested: number;
  transferApproved: number;
  transferPeer: string | null; // name of the other account in the transfer
  afterSuggested: number;
  afterApproved: number;
  afterPaid: number;
}

/**
 * Per-account cash position: bank balance + fixed lines, minus supplier payments.
 * An account funded by another (TD MJLB ← RBC) receives its week's payments as
 * one deposit, so they come out of the funder's balance and the funded account
 * nets to zero — except, after payments start, for money deposited but not yet paid out.
 * The deposit is counted as made once amounts are approved.
 */
export function computeCash(
  accounts: BankAccount[], cash: CashLine[], lines: RunLine[], suppliers: Map<string, Supplier>, paidAmounts: Map<string, number>,
): AccountCash[] {
  const fallback = accounts[0]?.id;
  const own = new Map(accounts.map((a) => {
    const mine = lines.filter((l) => (suppliers.get(l.supplier_id)?.bank_account_id ?? fallback) === a.id);
    return [a.id, {
      suggested: round2(mine.reduce((s, l) => s + n(l.suggested_amount), 0)),
      approved: round2(mine.reduce((s, l) => s + n(l.approved_amount), 0)),
      paid: round2(mine.reduce((s, l) => s + (l.payment_id ? n(paidAmounts.get(l.payment_id)) : 0), 0)),
    }];
  }));
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  return accounts.map((account) => {
    const lns = cash.filter((c) => c.bank_account_id === account.id);
    const base = round2(lns.reduce((s, c) => s + cashEffect(c.kind, c.amount), 0));
    const balanceMissing = lns.some((c) => c.kind === 'balance' && (c.amount === null || c.amount === undefined));
    const o = own.get(account.id)!;
    if (account.funded_by) {
      return {
        account, base, balanceMissing, ...o,
        transferSuggested: o.suggested, transferApproved: o.approved, transferPeer: name.get(account.funded_by) ?? null,
        afterSuggested: base,
        afterApproved: base,
        afterPaid: round2(base + o.approved - o.paid),
      };
    }
    const funded = accounts.filter((a) => a.funded_by === account.id);
    const tS = round2(funded.reduce((s, a) => s + own.get(a.id)!.suggested, 0));
    const tA = round2(funded.reduce((s, a) => s + own.get(a.id)!.approved, 0));
    return {
      account, base, balanceMissing, ...o,
      transferSuggested: tS, transferApproved: tA,
      transferPeer: funded.length ? funded.map((a) => a.name).join(', ') : null,
      afterSuggested: round2(base - o.suggested - tS),
      afterApproved: round2(base - o.approved - tA),
      afterPaid: round2(base - o.paid - tA),
    };
  });
}

export async function paymentAmounts(admin: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data } = await admin.from('ap_payments').select('id, amount, voided_at').in('id', ids);
  for (const p of data ?? []) if (!p.voided_at) out.set(p.id, n(p.amount));
  return out;
}

/** New weekly run: cash lines come from the template, amounts blank (re-entered every week). */
export async function createRun(admin: SupabaseClient, staffId: string, runDate: string): Promise<string> {
  const accounts = await loadAccounts(admin);
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  const template = await getSetting<CashTemplateItem[]>(admin, 'cash_template', []);
  const { data: run, error } = await admin.from('ap_runs')
    .insert({ run_date: runDate, created_by: staffId }).select('id').single();
  if (error || !run) throw error ?? new Error('run insert failed');
  const rows = template
    .filter((t) => byCode.has(t.account))
    .map((t, i) => ({
      run_id: run.id, bank_account_id: byCode.get(t.account)!, kind: t.kind, label: t.label,
      amount: null, as_of: t.kind === 'balance' ? todayIso() : null, sort_order: i,
    }));
  if (rows.length) await admin.from('ap_run_cash_lines').insert(rows);
  await logEvent(admin, { run_id: run.id, actor_staff_id: staffId, action: 'run_created', details: { run_date: runDate } });
  return run.id;
}

export async function previousRun(admin: SupabaseClient, run: Run) {
  const { data } = await admin.from('ap_runs').select('id').lt('run_date', run.run_date)
    .order('run_date', { ascending: false }).limit(1).maybeSingle();
  return data ? loadRun(admin, data.id) : null;
}

export function mintApproval(): { raw: string; hash: string; expiresAt: string } {
  const { raw, hash } = mintToken();
  // 18 hours: after that the approver logs into the portal to approve.
  return { raw, hash, expiresAt: new Date(Date.now() + 18 * 3600_000).toISOString() };
}

export function approvalUrl(rawToken: string): string {
  const base = import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca';
  return `${base.replace(/\/$/, '')}/portail/approbation-paiements/${rawToken}`;
}

export function approvalsPortalUrl(): string {
  const base = import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca';
  return `${base.replace(/\/$/, '')}/portail/paiements/approbations`;
}

export function runUrl(runId: string): string {
  const base = import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca';
  return `${base.replace(/\/$/, '')}/portail/paiements/semaine/${runId}`;
}

/** Line status shown in the workspace, in processing order. */
export function lineStatus(l: RunLine | undefined, run: Run): 'none' | 'suggested' | 'awaiting' | 'approved' | 'declined' | 'paid' | 'remitted' {
  if (!l) return 'none';
  if (l.remittance_sent_at) return 'remitted';
  if (l.payment_id) return 'paid';
  if (run.status === 'approved' || run.status === 'closed') {
    if (l.approved_amount && l.approved_amount > 0) return 'approved';
    return 'declined';
  }
  if (run.status === 'submitted') return 'awaiting';
  return n(l.suggested_amount) > 0 ? 'suggested' : 'none';
}

export async function signedFileUrl(admin: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await admin.storage.from('payables').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function uploadInvoiceFile(admin: SupabaseClient, supplierId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const path = `invoices/${supplierId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from('payables')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export function weekLabel(runDate: string): string {
  return new Date(runDate + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}
