// Two-way sync between the payables module and QuickBooks Online.
//
// Push: invoice → Bill (or VendorCredit) with the PDF attached; payment →
// BillPayment linked to those bills, so the remittance can be sent from QB.
// Pull: bills / bill payments created directly in QB are brought into the
// portal (matched to existing rows first, never duplicated).
// Every operation is logged in qbo_sync_log; failures are stored on the row
// (qbo_error) and never block the portal action that triggered them.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getQbo, qstr, QboError, type Qbo } from './qbo';
import { getSetting, n, round2 } from './payables';
import { docKey, queryVendorDocs } from './qbo-reconcile';

export interface QboDefaults {
  expense_account_id: string | null;
  tax_code_id: string | null;
  push_bills: boolean;
  push_payments: boolean;
  pull: boolean;
}

export const qboDefaults = (admin: SupabaseClient) =>
  getSetting<QboDefaults>(admin, 'qbo_defaults', { expense_account_id: null, tax_code_id: null, push_bills: true, push_payments: true, pull: true });

async function log(admin: SupabaseClient, e: { direction: 'push' | 'pull' | 'system'; entity: string; portal_id?: string | null; qbo_id?: string | null; status: 'ok' | 'skipped' | 'error' | 'warning'; message?: string }) {
  await admin.from('qbo_sync_log').insert(e);
}

const errMsg = (e: unknown) => (e instanceof QboError || e instanceof Error ? e.message : String(e)).slice(0, 500);
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(inc|ltd|ltee|limited|corp|enr|llc|co)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// ------------------------------------------------------------------ vendors
interface SupplierRowLite { id: string; name: string; legal_name: string | null; qbo_vendor_name: string | null; qbo_vendor_id: string | null; contact_email: string | null }

async function ensureVendor(admin: SupabaseClient, qbo: Qbo, s: SupplierRowLite): Promise<string> {
  if (s.qbo_vendor_id) return s.qbo_vendor_id;
  const display = (s.qbo_vendor_name ?? s.name).slice(0, 100);
  const found = await qbo.query('Vendor', `DisplayName = ${qstr(display)}`);
  let id: string;
  if (found[0]) {
    id = found[0].Id;
  } else {
    const res = await qbo.post('/vendor', {
      DisplayName: display,
      ...(s.legal_name ? { CompanyName: s.legal_name.slice(0, 100) } : {}),
      ...(s.contact_email ? { PrimaryEmailAddr: { Address: s.contact_email } } : {}),
    });
    id = res.Vendor.Id;
    await log(admin, { direction: 'push', entity: 'vendor', portal_id: s.id, qbo_id: id, status: 'ok', message: `Fournisseur créé dans QB : ${display}` });
  }
  await admin.from('ap_suppliers').update({ qbo_vendor_id: id }).eq('id', s.id);
  return id;
}

/** Auto-link portal suppliers to QB vendors by (normalized) name; returns counts and the unmatched. */
export async function linkVendors(admin: SupabaseClient) {
  const qbo = await getQbo(admin);
  if (!qbo) throw new Error('QuickBooks non connecté');
  const vendors = await qbo.query('Vendor', 'Active = true');
  const { data: sups } = await admin.from('ap_suppliers').select('id, name, legal_name, qbo_vendor_name, qbo_vendor_id');
  const taken = new Set((sups ?? []).map((s) => s.qbo_vendor_id).filter(Boolean));
  let matched = 0;
  for (const s of sups ?? []) {
    if (s.qbo_vendor_id) continue;
    const keys = [s.qbo_vendor_name, s.name, s.legal_name].map(norm).filter(Boolean);
    const v = vendors.find((x) => !taken.has(x.Id) && [x.DisplayName, x.CompanyName].map(norm).some((k) => k && keys.includes(k)));
    if (v) {
      await admin.from('ap_suppliers').update({ qbo_vendor_id: v.Id }).eq('id', s.id);
      taken.add(v.Id);
      matched++;
    }
  }
  const linkedBills = await matchOpenBills(admin, qbo);
  await log(admin, { direction: 'system', entity: 'vendor', status: 'ok', message: `${matched} fournisseur(s) liés automatiquement, ${linkedBills} facture(s) ouvertes rapprochées` });
  return { matched, linkedBills, vendors: vendors.map((v) => ({ id: v.Id as string, name: v.DisplayName as string, balance: n(v.Balance) })) };
}

/** Link open portal invoices (e.g. imported from the workbook) to the matching open QB bill (same vendor + number). */
async function matchOpenBills(admin: SupabaseClient, qbo: Qbo): Promise<number> {
  const bills = await qbo.query('Bill', 'Balance > \'0\'');
  const { data: invs } = await admin.from('ap_invoices')
    .select('id, invoice_number, supplier_id, ap_suppliers!inner(qbo_vendor_id)')
    .is('qbo_bill_id', null).is('voided_at', null).not('invoice_number', 'is', null);
  let count = 0;
  for (const i of invs ?? []) {
    const vid = (i.ap_suppliers as unknown as { qbo_vendor_id: string | null }).qbo_vendor_id;
    if (!vid) continue;
    const b = bills.find((x) => x.VendorRef?.value === vid && norm(x.DocNumber) === norm(i.invoice_number));
    if (!b) continue;
    const { error } = await admin.from('ap_invoices').update({ qbo_bill_id: b.Id, in_quickbooks: true, qbo_synced_at: new Date().toISOString() }).eq('id', i.id);
    if (!error) count++;
  }
  return count;
}

export const TO_CLASSIFY = 'À classer : choisissez le compte de dépense QuickBooks (Paiements → QuickBooks → Factures à classer)';

// ------------------------------------------------------------------ vendor choice at review
/** QB vendor that best matches a supplier (its link, else names/aliases/extracted names, whole words). */
export function matchVendor(
  vendors: Array<{ id: string; name: string }>,
  names: Array<string | null | undefined>,
): string | null {
  const keys = names.map(norm).filter(Boolean);
  if (!keys.length) return null;
  const words = (t: string) => new Set(t.split(' ').filter((w) => w.length > 1));
  let best: { id: string; score: number } | null = null;
  for (const v of vendors) {
    const vn = norm(v.name);
    if (!vn) continue;
    for (const k of keys) {
      let score = 0;
      if (vn === k) score = 1;
      else {
        const a = words(vn), b = words(k);
        if (a.size && b.size && ([...a].every((w) => b.has(w)) || [...b].every((w) => a.has(w)))) score = 0.8;
      }
      if (score && (!best || score > best.score)) best = { id: v.id, score };
    }
  }
  return best?.id ?? null;
}

/** Link the supplier to an existing QB vendor, or create one under the name printed on the invoice. */
export async function linkVendorChoice(
  admin: SupabaseClient, supplierId: string, choice: string,
  opts: { displayName?: string | null; legalName?: string | null; email?: string | null },
): Promise<void> {
  if (!choice) return;
  if (choice !== 'new') {
    const { error } = await admin.from('ap_suppliers').update({ qbo_vendor_id: choice }).eq('id', supplierId);
    if (error) await log(admin, { direction: 'system', entity: 'vendor', portal_id: supplierId, qbo_id: choice, status: 'warning', message: `Lien fournisseur QB refusé : ${error.message}` });
    return;
  }
  const qbo = await getQbo(admin);
  if (!qbo) return;
  const { data: s } = await admin.from('ap_suppliers').select('name, legal_name, contact_email').eq('id', supplierId).single();
  const display = (opts.displayName || s?.legal_name || s?.name || 'Fournisseur').slice(0, 100);
  try {
    const found = await qbo.query('Vendor', `DisplayName = ${qstr(display)}`);
    const id = found[0]?.Id ?? (await qbo.post('/vendor', {
      DisplayName: display,
      ...(opts.legalName ? { CompanyName: opts.legalName.slice(0, 100) } : {}),
      ...((opts.email ?? s?.contact_email) ? { PrimaryEmailAddr: { Address: opts.email ?? s?.contact_email } } : {}),
    })).Vendor.Id;
    await admin.from('ap_suppliers').update({ qbo_vendor_id: id, qbo_vendor_name: display }).eq('id', supplierId);
    await log(admin, { direction: 'push', entity: 'vendor', portal_id: supplierId, qbo_id: id, status: 'ok', message: `Fournisseur QB ${found[0] ? 'lié' : 'créé'} : ${display}` });
  } catch (e) {
    await log(admin, { direction: 'push', entity: 'vendor', portal_id: supplierId, status: 'error', message: errMsg(e) });
  }
}

// ------------------------------------------------------------------ coding suggestion
export interface CodingSuggestion {
  accountId: string | null;
  taxCodeId: string | null;
  basedOn: number;          // number of previous QB bills looked at
  share: number;            // fraction of those using the suggested account
  vendorName: string | null;
}

/**
 * How this supplier's previous QB bills were coded: the most used expense
 * account and tax code over its last 25 bills. Links the supplier to its QB
 * vendor first (exact normalized name) if it isn't yet. Never creates anything.
 */
export async function suggestCoding(admin: SupabaseClient, supplierId: string): Promise<CodingSuggestion> {
  const none: CodingSuggestion = { accountId: null, taxCodeId: null, basedOn: 0, share: 0, vendorName: null };
  const qbo = await getQbo(admin);
  if (!qbo) return none;
  const { data: s } = await admin.from('ap_suppliers')
    .select('id, name, legal_name, qbo_vendor_name, qbo_vendor_id, qbo_expense_account_id, qbo_tax_code_id').eq('id', supplierId).maybeSingle();
  if (!s) return none;
  let vendorId = s.qbo_vendor_id as string | null;
  let vendorName: string | null = null;
  if (!vendorId) {
    const keys = [s.qbo_vendor_name, s.name, s.legal_name].map(norm).filter(Boolean);
    const vendors = await qbo.query('Vendor', 'Active = true');
    const v = vendors.find((x) => [x.DisplayName, x.CompanyName].map(norm).some((k) => k && keys.includes(k)));
    if (v) {
      vendorId = v.Id;
      vendorName = v.DisplayName;
      const { error } = await admin.from('ap_suppliers').update({ qbo_vendor_id: v.Id }).eq('id', s.id);
      if (error) vendorId = v.Id; // already linked elsewhere — still usable for the suggestion
    }
  }
  if (!vendorId) {
    return { ...none, accountId: s.qbo_expense_account_id, taxCodeId: s.qbo_tax_code_id };
  }
  const q = `select * from Bill where VendorRef = ${qstr(vendorId)} orderby TxnDate desc maxresults 25`;
  const res = await qbo.get(`/query?query=${encodeURIComponent(q)}`);
  const bills: any[] = res?.QueryResponse?.Bill ?? [];
  const acc = new Map<string, number>();
  const tax = new Map<string, number>();
  for (const b of bills) {
    for (const l of b.Line ?? []) {
      const d = l.AccountBasedExpenseLineDetail;
      if (!d) continue;
      const w = Math.abs(n(l.Amount)) || 1;
      if (d.AccountRef?.value) acc.set(d.AccountRef.value, (acc.get(d.AccountRef.value) ?? 0) + w);
      if (d.TaxCodeRef?.value) tax.set(d.TaxCodeRef.value, (tax.get(d.TaxCodeRef.value) ?? 0) + w);
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const a = top(acc), t = top(tax);
  const totalW = [...acc.values()].reduce((x, y) => x + y, 0) || 1;
  return {
    accountId: s.qbo_expense_account_id ?? a?.[0] ?? null,
    taxCodeId: s.qbo_tax_code_id ?? t?.[0] ?? null,
    basedOn: bills.length,
    share: a ? Math.round((a[1] / totalW) * 100) / 100 : 0,
    vendorName,
  };
}

// ------------------------------------------------------------------ push: invoice → Bill
export async function pushInvoice(admin: SupabaseClient, invoiceId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  const qbo = await getQbo(admin);
  if (!qbo) return { ok: false, message: 'QuickBooks non connecté' };
  const { data: inv } = await admin.from('ap_invoices').select('*, ap_suppliers(*)').eq('id', invoiceId).maybeSingle();
  if (!inv) return { ok: false, message: 'Facture introuvable' };
  if (inv.qbo_bill_id) return { ok: true, message: 'Déjà dans QuickBooks' };
  if (inv.voided_at) return { ok: false, message: 'Facture annulée' };
  if (!['invoice', 'credit'].includes(inv.kind)) return { ok: false, message: 'Les soldes d’ouverture et ajustements ne sont pas envoyés à QB' };
  if (inv.source === 'qbo') return { ok: true, message: 'Provient de QuickBooks' };
  if (inv.source === 'import' && !opts.force) return { ok: false, message: 'Facture importée du classeur — déjà dans QB en principe' };

  const defaults = await qboDefaults(admin);
  const sup = inv.ap_suppliers as SupplierRowLite & { qbo_expense_account_id: string | null; qbo_tax_code_id: string | null };
  // Only an explicit choice is pushed: the coding reviewed on the invoice, a
  // per-supplier override, or the (optional) default. History is a suggestion
  // shown at review time, never applied silently.
  const account = inv.qbo_account_id ?? sup.qbo_expense_account_id ?? defaults.expense_account_id;
  const taxCode = inv.qbo_tax_code_id ?? sup.qbo_tax_code_id ?? defaults.tax_code_id;
  const fail = async (message: string, status: 'error' | 'skipped' = 'error') => {
    await admin.from('ap_invoices').update({ qbo_error: message }).eq('id', invoiceId);
    await log(admin, { direction: 'push', entity: 'bill', portal_id: invoiceId, status, message });
    return { ok: false, message };
  };
  if (!account) return fail(TO_CLASSIFY, 'skipped');

  try {
    const vendorId = await ensureVendor(admin, qbo, sup);
    const total = Math.abs(n(inv.amount));
    const subtotal = inv.subtotal !== null ? Math.abs(n(inv.subtotal)) : null;
    const taxMode = !taxCode ? 'NotApplicable' : subtotal !== null ? 'TaxExcluded' : 'TaxInclusive';
    const lineAmount = taxMode === 'TaxExcluded' ? subtotal! : total;
    const entity = inv.kind === 'credit' ? 'VendorCredit' : 'Bill';
    const body: Record<string, unknown> = {
      VendorRef: { value: vendorId },
      ...(inv.invoice_number ? { DocNumber: String(inv.invoice_number).slice(0, 21) } : {}),
      ...(inv.invoice_date ? { TxnDate: inv.invoice_date } : {}),
      ...(entity === 'Bill' && inv.due_date ? { DueDate: inv.due_date } : {}),
      GlobalTaxCalculation: taxMode,
      PrivateNote: [inv.po_number && `PO ${inv.po_number}`, 'Saisie via Portail Oaziz'].filter(Boolean).join(' · '),
      Line: [{
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: lineAmount,
        Description: (inv.description ?? '').slice(0, 4000) || undefined,
        AccountBasedExpenseLineDetail: { AccountRef: { value: account }, ...(taxCode ? { TaxCodeRef: { value: taxCode } } : {}) },
      }],
    };
    const res = await qbo.post(`/${entity.toLowerCase()}`, body);
    const created = res[entity];
    let warning: string | null = null;
    if (Math.abs(n(created.TotalAmt) - total) > 0.05) {
      warning = `Total dans QB ${n(created.TotalAmt).toFixed(2)} $ ≠ portail ${total.toFixed(2)} $ — vérifiez la taxe dans QB`;
    }
    await admin.from('ap_invoices').update({
      qbo_bill_id: created.Id, in_quickbooks: true, qbo_synced_at: new Date().toISOString(), qbo_error: warning,
    }).eq('id', invoiceId);

    if (inv.file_path) {
      try {
        const { data: file } = await admin.storage.from('payables').download(inv.file_path);
        if (file) {
          const ext = inv.file_path.split('.').pop() ?? 'pdf';
          const ct = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          await qbo.upload(`${(inv.invoice_number ?? 'facture').replace(/[^\w.-]/g, '_')}.${ext}`, ct, Buffer.from(await file.arrayBuffer()), entity, created.Id);
        }
      } catch (e) {
        warning = `${warning ? `${warning} · ` : ''}PDF non joint dans QB (${errMsg(e)})`;
        await admin.from('ap_invoices').update({ qbo_error: warning }).eq('id', invoiceId);
      }
    }
    await log(admin, { direction: 'push', entity: entity.toLowerCase(), portal_id: invoiceId, qbo_id: created.Id, status: warning ? 'warning' : 'ok', message: warning ?? `${entity} ${inv.invoice_number ?? ''} créée` });
    return { ok: true, message: warning ?? 'Envoyée à QuickBooks' };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ------------------------------------------------------------------ imported invoices → their QB bill
type AllocInvoice = { id: string; qbo_bill_id: string | null; in_quickbooks: boolean; source: string; invoice_number: string | null };

/** Prefix of the error left on a payment whose bill could not be identified; the supplier page offers a picker for it. */
export const BILL_NOT_FOUND = 'Facture QB à identifier';

/**
 * The QB vendor a supplier's bills live under — the existing link, or exactly
 * one active vendor with the same name. Never creates one: a new vendor would
 * hold none of the supplier's bills, and would duplicate the real one.
 */
async function existingVendor(admin: SupabaseClient, qbo: Qbo, s: SupplierRowLite): Promise<string | null> {
  if (s.qbo_vendor_id) return s.qbo_vendor_id;
  const keys = [s.qbo_vendor_name, s.name, s.legal_name].map(norm).filter(Boolean);
  if (keys.length === 0) return null;
  const vendors = await qbo.query('Vendor', 'Active = true');
  const hits = vendors.filter((v) => [v.DisplayName, v.CompanyName].map(norm).some((k) => k && keys.includes(k)));
  if (hits.length !== 1) return null;
  const { data: taken } = await admin.from('ap_suppliers').select('id').eq('qbo_vendor_id', hits[0].Id).neq('id', s.id).limit(1);
  if (taken?.length) return null;
  await admin.from('ap_suppliers').update({ qbo_vendor_id: hits[0].Id }).eq('id', s.id);
  s.qbo_vendor_id = hits[0].Id;
  await log(admin, { direction: 'system', entity: 'vendor', portal_id: s.id, qbo_id: hits[0].Id, status: 'ok', message: `Fournisseur lié à QB par son nom : ${hits[0].DisplayName}` });
  return hits[0].Id as string;
}

/**
 * The open bill an imported invoice should be paid against, when there is no
 * doubt: same number; else the only bill with exactly this open amount; else the
 * vendor's only open bill, if it can absorb the payment. Returns every candidate
 * at the deciding step — exactly one means "use it", anything else means "ask".
 */
export function pickBill<B extends { DocNumber?: string | null; Balance?: unknown }>(
  pool: B[], invoiceNumber: string | null, amount: number,
): B[] {
  let pick = invoiceNumber
    ? pool.filter((b) => docKey(b.DocNumber) && docKey(b.DocNumber) === docKey(invoiceNumber))
    : [];
  if (pick.length === 1) return pick;
  // Two different numbers mean two different bills, whatever the amounts say:
  // only bills that carry no number are eligible to be matched by amount when
  // the invoice has one.
  const eligible = invoiceNumber ? pool.filter((b) => !docKey(b.DocNumber)) : pool;
  pick = eligible.filter((b) => Math.abs(n(b.Balance) - amount) < 0.01);
  if (pick.length !== 1 && pool.length === 1 && eligible.length === 1 && n(pool[0].Balance) + 0.005 >= amount) pick = pool;
  return pick;
}

/**
 * Link each imported invoice being paid to its open bill in QB, so the bill
 * payment can be created. A bill is only chosen when there is no doubt: the same
 * number; else the only open bill with exactly that open amount; else the
 * vendor's only open bill, if it can absorb this payment. Anything less certain
 * is left for a person to pick, and nothing is paid until every invoice has its
 * bill. Links that were found are kept either way — they are correct.
 */
async function resolveImportedBills(
  admin: SupabaseClient, qbo: Qbo, sup: SupplierRowLite,
  unlinked: Array<{ amount: number; inv: AllocInvoice | null }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const vendorId = await existingVendor(admin, qbo, sup);
  if (!vendorId) {
    return { ok: false, message: `Fournisseur « ${sup.name} » non lié à un fournisseur QuickBooks — liez-le dans Paiements → QuickBooks, puis réessayez` };
  }

  const bills = (await queryVendorDocs(qbo, 'Bill', vendorId)).filter((b) => n(b.Balance) > 0.005);
  // A bill already linked to another portal invoice is not available.
  const ids = bills.map((b) => String(b.Id));
  const { data: claimed } = ids.length
    ? await admin.from('ap_invoices').select('qbo_bill_id').in('qbo_bill_id', ids)
    : { data: [] };
  const used = new Set((claimed ?? []).map((c) => String(c.qbo_bill_id)));
  const free = () => bills.filter((b) => !used.has(String(b.Id)));

  const missing: string[] = [];
  for (const r of unlinked) {
    const inv = r.inv!;
    const pick = pickBill(free(), inv.invoice_number, r.amount);
    if (pick.length !== 1) {
      missing.push(`${inv.invoice_number ? `n° ${inv.invoice_number}` : 'sans numéro'} (${r.amount.toFixed(2)} $)`);
      continue;
    }
    const billId = String(pick[0].Id);
    const { error } = await admin.from('ap_invoices').update({ qbo_bill_id: billId, in_quickbooks: true, qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', inv.id);
    if (error) { missing.push(`${inv.invoice_number ?? 'sans numéro'} (${error.message})`); continue; }
    inv.qbo_bill_id = billId;
    used.add(billId);
    await log(admin, { direction: 'system', entity: 'bill', portal_id: inv.id, qbo_id: billId, status: 'ok', message: `Facture importée ${inv.invoice_number ?? ''} liée à la facture QB ${pick[0].DocNumber ?? billId}` });
  }

  if (missing.length > 0) {
    const open = free().length;
    return {
      ok: false,
      message: `${BILL_NOT_FOUND} : ${missing.join(', ')} — QB a ${open} facture(s) ouverte(s) pour ce fournisseur. Choisissez la bonne ci-dessous, puis réessayez`,
    };
  }
  return { ok: true };
}

/**
 * Open QB bills of a supplier's vendor that no portal invoice has claimed yet —
 * the choices offered when a paid invoice's bill could not be identified.
 */
export async function openBillsForSupplier(admin: SupabaseClient, supplierId: string): Promise<Array<{ id: string; number: string | null; date: string | null; balance: number }>> {
  const qbo = await getQbo(admin);
  if (!qbo) return [];
  const { data: s } = await admin.from('ap_suppliers').select('qbo_vendor_id').eq('id', supplierId).maybeSingle();
  if (!s?.qbo_vendor_id) return [];
  const bills = (await queryVendorDocs(qbo, 'Bill', s.qbo_vendor_id)).filter((b) => n(b.Balance) > 0.005);
  const ids = bills.map((b) => String(b.Id));
  const { data: claimed } = ids.length ? await admin.from('ap_invoices').select('qbo_bill_id').in('qbo_bill_id', ids) : { data: [] };
  const used = new Set((claimed ?? []).map((c) => String(c.qbo_bill_id)));
  return bills
    .filter((b) => !used.has(String(b.Id)))
    .map((b) => ({ id: String(b.Id), number: b.DocNumber ?? null, date: b.TxnDate ?? null, balance: round2(n(b.Balance)) }))
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
}

// ------------------------------------------------------------------ push: payment → BillPayment
export async function pushPayment(admin: SupabaseClient, paymentId: string): Promise<{ ok: boolean; message: string }> {
  const qbo = await getQbo(admin);
  if (!qbo) return { ok: false, message: 'QuickBooks non connecté' };
  const { data: p } = await admin.from('ap_payments').select('*, ap_suppliers(*), ap_bank_accounts!ap_payments_bank_account_id_fkey(*)').eq('id', paymentId).maybeSingle();
  if (!p || p.voided_at) return { ok: false, message: 'Paiement introuvable ou annulé' };
  if (p.qbo_billpayment_id || p.qbo_synced_at) return { ok: true, message: 'Déjà dans QuickBooks' };
  if (p.source !== 'portal') return { ok: true, message: 'Non envoyé (historique ou provenant de QB)' };
  // RBC → TD deposits are entered in QuickBooks by hand (as MJLB bill payments)
  // and pulled back in; the portal never creates them there (decided 2026-10-09).
  if (p.transfer_to_account_id) {
    await admin.from('ap_payments').update({ qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', paymentId);
    return { ok: true, message: 'Dépôt RBC → TD — saisi dans QB à la main, non envoyé' };
  }
  const fail = async (message: string, status: 'error' | 'skipped' = 'error') => {
    await admin.from('ap_payments').update({ qbo_error: message }).eq('id', paymentId);
    await log(admin, { direction: 'push', entity: 'billpayment', portal_id: paymentId, status, message });
    return { ok: false, message };
  };
  const bank = p.ap_bank_accounts as { name: string; qbo_account_id: string | null } | null;
  if (!bank?.qbo_account_id) return fail(`Compte bancaire « ${bank?.name ?? '?'} » non lié à un compte QB — voir Paiements → QuickBooks`, 'skipped');

  const { data: allocs } = await admin.from('ap_payment_allocations')
    .select('amount, ap_invoices(id, qbo_bill_id, in_quickbooks, source, invoice_number)').eq('payment_id', paymentId);
  const rows = (allocs ?? []).map((a) => ({ amount: n(a.amount), inv: a.ap_invoices as unknown as AllocInvoice | null }));

  // Paying entries that were entered in the portal as "already in QB as an
  // expense" (reimbursements): QB has the money going out already, so no bill
  // payment is created. Only portal entries qualify. Imported invoices are also
  // flagged in_quickbooks, but they are real open BILLS in QB that were simply
  // never linked — treating them as expenses is what silently skipped 23
  // payments on 2026-10-09 while reporting them as done.
  if (rows.length > 0 && rows.every((r) => r.inv && r.inv.source === 'portal' && r.inv.in_quickbooks && !r.inv.qbo_bill_id)) {
    await admin.from('ap_payments').update({ qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', paymentId);
    await log(admin, { direction: 'push', entity: 'billpayment', portal_id: paymentId, status: 'skipped', message: 'Déjà dans QB comme dépense — aucun paiement créé' });
    return { ok: true, message: 'Déjà dans QB comme dépense — aucun paiement créé' };
  }

  // Imported invoices with no bill link yet: find each one's open bill in QB
  // first. All or nothing — a bill payment is never created for only part of
  // what was paid because one bill could not be identified.
  const unlinked = rows.filter((r) => r.inv && !r.inv.qbo_bill_id && r.inv.source !== 'portal');
  if (unlinked.length > 0) {
    const found = await resolveImportedBills(admin, qbo, p.ap_suppliers as SupplierRowLite, unlinked);
    if (!found.ok) return fail(found.message);
  }

  const lines = rows
    .map((r) => ({ amount: r.amount, bill: r.inv?.qbo_bill_id ?? null }))
    .filter((a): a is { amount: number; bill: string } => !!a.bill);
  if (lines.length === 0) return fail('Aucune des factures payées n’est liée à une facture QB — enregistrez ce paiement dans QB manuellement', 'skipped');

  try {
    const sup = p.ap_suppliers as SupplierRowLite;
    // Bills already exist under a vendor, so pay that vendor; only fall back to
    // ensureVendor (which can create one) when the supplier has no link at all.
    const vendorId = sup.qbo_vendor_id ?? await ensureVendor(admin, qbo, sup);
    const total = round2(lines.reduce((s, l) => s + l.amount, 0));
    const res = await qbo.post('/billpayment', {
      VendorRef: { value: vendorId },
      PayType: 'Check',
      // Paid electronically: never "Print later"; the PMT reference is the payment's Ref no.
      CheckPayment: { BankAccountRef: { value: bank.qbo_account_id }, PrintStatus: 'NotSet' },
      ...(p.reference ? { DocNumber: String(p.reference).slice(0, 21) } : {}),
      TotalAmt: total,
      TxnDate: p.paid_on,
      PrivateNote: ['Portail Oaziz', p.reference].filter(Boolean).join(' · '),
      Line: lines.map((l) => ({ Amount: l.amount, LinkedTxn: [{ TxnId: l.bill, TxnType: 'Bill' }] })),
    });
    const id = res.BillPayment.Id;
    const partial = total < n(p.amount) - 0.005 ? `Seuls ${total.toFixed(2)} $ sur ${n(p.amount).toFixed(2)} $ liés à des factures QB` : null;
    await admin.from('ap_payments').update({ qbo_billpayment_id: id, qbo_synced_at: new Date().toISOString(), qbo_error: partial }).eq('id', paymentId);
    await log(admin, { direction: 'push', entity: 'billpayment', portal_id: paymentId, qbo_id: id, status: partial ? 'warning' : 'ok', message: partial ?? `Paiement ${total.toFixed(2)} $ créé` });
    return { ok: true, message: partial ?? 'Paiement créé dans QuickBooks' };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/** Bring an already-created QB bill payment in line: Ref no. = portal reference, not "Print later". */
export async function refreshQboPayment(admin: SupabaseClient, paymentId: string): Promise<{ ok: boolean; message: string }> {
  const qbo = await getQbo(admin);
  if (!qbo) return { ok: false, message: 'QuickBooks non connecté' };
  const { data: p } = await admin.from('ap_payments').select('reference, qbo_billpayment_id').eq('id', paymentId).maybeSingle();
  if (!p?.qbo_billpayment_id) return { ok: false, message: 'Paiement introuvable ou annulé' };
  try {
    const cur = (await qbo.get(`/billpayment/${p.qbo_billpayment_id}`))?.BillPayment;
    if (!cur) return { ok: false, message: 'Paiement introuvable ou annulé' };
    await qbo.post('/billpayment', {
      Id: cur.Id, SyncToken: cur.SyncToken, sparse: true, VendorRef: cur.VendorRef, TotalAmt: cur.TotalAmt, PayType: cur.PayType,
      ...(p.reference ? { DocNumber: String(p.reference).slice(0, 21) } : {}),
      ...(cur.PayType === 'Check' ? { CheckPayment: { ...cur.CheckPayment, PrintStatus: 'NotSet' } } : {}),
    });
    await log(admin, { direction: 'push', entity: 'billpayment', portal_id: paymentId, qbo_id: cur.Id, status: 'ok', message: `Paiement ${p.reference ?? ''} mis à jour dans QB` });
    return { ok: true, message: `Paiement ${p.reference ?? ''} mis à jour dans QB` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** When a portal invoice is voided, delete its Bill / VendorCredit in QB too (refused by QB if paid). */
export async function deleteQboBill(admin: SupabaseClient, invoiceId: string): Promise<string | null> {
  const { data: inv } = await admin.from('ap_invoices').select('qbo_bill_id, kind').eq('id', invoiceId).maybeSingle();
  if (!inv?.qbo_bill_id) return null;
  const qbo = await getQbo(admin);
  if (!qbo) return 'QuickBooks non connecté — supprimez la facture dans QB manuellement';
  const entity = inv.kind === 'credit' ? 'vendorcredit' : 'bill';
  const key = inv.kind === 'credit' ? 'VendorCredit' : 'Bill';
  try {
    const cur = await qbo.get(`/${entity}/${inv.qbo_bill_id}`);
    await qbo.post(`/${entity}?operation=delete`, { Id: inv.qbo_bill_id, SyncToken: cur[key].SyncToken });
    await admin.from('ap_invoices').update({ qbo_bill_id: null }).eq('id', invoiceId);
    await log(admin, { direction: 'push', entity, portal_id: invoiceId, qbo_id: inv.qbo_bill_id, status: 'ok', message: 'Facture supprimée dans QB (annulée au portail)' });
    return null;
  } catch (e) {
    const message = `Suppression dans QB impossible (${errMsg(e)}) — supprimez-la dans QB manuellement`;
    await log(admin, { direction: 'push', entity, portal_id: invoiceId, qbo_id: inv.qbo_bill_id, status: 'error', message });
    return message;
  }
}

/** When a portal payment is voided, delete its BillPayment in QB too. */
export async function deleteQboPayment(admin: SupabaseClient, paymentId: string) {
  const { data: p } = await admin.from('ap_payments').select('qbo_billpayment_id').eq('id', paymentId).maybeSingle();
  if (!p?.qbo_billpayment_id) return;
  const qbo = await getQbo(admin);
  if (!qbo) return;
  try {
    const cur = await qbo.get(`/billpayment/${p.qbo_billpayment_id}`);
    await qbo.post('/billpayment?operation=delete', { Id: p.qbo_billpayment_id, SyncToken: cur.BillPayment.SyncToken });
    await admin.from('ap_payments').update({ qbo_billpayment_id: null }).eq('id', paymentId);
    await log(admin, { direction: 'push', entity: 'billpayment', portal_id: paymentId, qbo_id: p.qbo_billpayment_id, status: 'ok', message: 'Paiement supprimé dans QB (annulé au portail)' });
  } catch (e) {
    await log(admin, { direction: 'push', entity: 'billpayment', portal_id: paymentId, qbo_id: p.qbo_billpayment_id, status: 'error', message: `Suppression dans QB impossible : ${errMsg(e)}` });
  }
}

// ------------------------------------------------------------------ pull: QB → portal
async function supplierForVendor(admin: SupabaseClient, vendorId: string) {
  const { data } = await admin.from('ap_suppliers').select('id, name').eq('qbo_vendor_id', vendorId).maybeSingle();
  return data;
}

export async function pullFromQbo(admin: SupabaseClient): Promise<{ bills: number; payments: number; skipped: number }> {
  const qbo = await getQbo(admin);
  if (!qbo) throw new Error('QuickBooks non connecté');
  const { data: conn } = await admin.from('qbo_connection').select('last_pull_cursor').eq('id', 1).single();
  const startedAt = new Date();
  const since = new Date(new Date(conn?.last_pull_cursor ?? startedAt).getTime() - 5 * 60_000).toISOString();
  let bills = 0, payments = 0, skipped = 0;

  for (const b of await qbo.query('Bill', `MetaData.LastUpdatedTime > ${qstr(since)}`)) {
    const { data: linked } = await admin.from('ap_invoices').select('id, amount').eq('qbo_bill_id', b.Id).maybeSingle();
    if (linked) {
      if (Math.abs(n(linked.amount) - n(b.TotalAmt)) > 0.05) {
        await log(admin, { direction: 'pull', entity: 'bill', portal_id: linked.id, qbo_id: b.Id, status: 'warning', message: `Montant modifié dans QB : ${n(b.TotalAmt).toFixed(2)} $ (portail ${n(linked.amount).toFixed(2)} $)` });
      }
      continue;
    }
    const sup = await supplierForVendor(admin, b.VendorRef?.value);
    if (!sup) {
      skipped++;
      await log(admin, { direction: 'pull', entity: 'bill', qbo_id: b.Id, status: 'skipped', message: `Fournisseur QB « ${b.VendorRef?.name} » non lié au portail` });
      continue;
    }
    // Same supplier + same number already in the portal: link instead of duplicating.
    const { data: same } = b.DocNumber
      ? await admin.from('ap_invoices').select('id').eq('supplier_id', sup.id).eq('invoice_number', b.DocNumber).is('qbo_bill_id', null).is('voided_at', null).limit(1)
      : { data: [] };
    if (same?.length) {
      await admin.from('ap_invoices').update({ qbo_bill_id: b.Id, in_quickbooks: true, qbo_synced_at: new Date().toISOString() }).eq('id', same[0].id);
      continue;
    }
    const { data: created } = await admin.from('ap_invoices').insert({
      supplier_id: sup.id, kind: 'invoice', invoice_number: b.DocNumber ?? null, invoice_date: b.TxnDate ?? null,
      due_date: b.DueDate ?? null, amount: n(b.TotalAmt), description: b.Line?.[0]?.Description ?? b.PrivateNote ?? null,
      in_quickbooks: true, source: 'qbo', qbo_bill_id: b.Id, qbo_synced_at: new Date().toISOString(),
    }).select('id').single();
    bills++;
    await log(admin, { direction: 'pull', entity: 'bill', portal_id: created?.id, qbo_id: b.Id, status: 'ok', message: `Facture ${b.DocNumber ?? ''} importée de QB (${sup.name})` });
  }

  const { data: connRow } = await admin.from('qbo_connection').select('connected_at').eq('id', 1).maybeSingle();
  const connectedOn = String(connRow?.connected_at ?? '').slice(0, 10);
  const { data: fundedAccts } = await admin.from('ap_bank_accounts').select('id, funded_by, funding_supplier_id').not('funding_supplier_id', 'is', null);
  for (const bp of await qbo.query('BillPayment', `MetaData.LastUpdatedTime > ${qstr(since)}`)) {
    const { data: linked } = await admin.from('ap_payments').select('id').eq('qbo_billpayment_id', bp.Id).maybeSingle();
    if (linked) continue;
    // Payments made before QuickBooks was connected are already in the imported balances.
    if (connectedOn && String(bp.TxnDate ?? '') < connectedOn) continue;
    const sup = await supplierForVendor(admin, bp.VendorRef?.value);
    if (!sup) {
      skipped++;
      await log(admin, { direction: 'pull', entity: 'billpayment', qbo_id: bp.Id, status: 'skipped', message: `Fournisseur QB « ${bp.VendorRef?.name} » non lié au portail` });
      continue;
    }
    const amount = n(bp.TotalAmt);
    // A payment already ticked in the portal (same supplier/amount, ±7 days): link it.
    const d = new Date(bp.TxnDate + 'T12:00:00');
    const from = new Date(d.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
    const to = new Date(d.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
    const { data: same } = await admin.from('ap_payments').select('id').eq('supplier_id', sup.id).eq('amount', amount)
      .is('qbo_billpayment_id', null).is('voided_at', null).gte('paid_on', from).lte('paid_on', to).limit(1);
    if (same?.length) {
      await admin.from('ap_payments').update({ qbo_billpayment_id: bp.Id, qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', same[0].id);
      continue;
    }
    const billIds = (bp.Line ?? []).flatMap((l: any) => (l.LinkedTxn ?? []).filter((t: any) => t.TxnType === 'Bill').map((t: any) => t.TxnId));
    const { data: invs } = billIds.length ? await admin.from('ap_invoices').select('id').in('qbo_bill_id', billIds) : { data: [] };
    const { data: pid, error } = await admin.rpc('ap_record_payment', {
      p_supplier_id: sup.id, p_amount: amount, p_paid_on: bp.TxnDate, p_method: null, p_bank_account_id: null,
      p_reference: bp.DocNumber ?? '', p_notes: 'Importé de QuickBooks', p_staff_id: null, p_run_line_id: null,
      p_invoice_ids: (invs ?? []).map((i) => i.id),
    });
    if (error || !pid) {
      await log(admin, { direction: 'pull', entity: 'billpayment', qbo_id: bp.Id, status: 'error', message: errMsg(error) });
      continue;
    }
    await admin.from('ap_payments').update({ source: 'qbo', qbo_billpayment_id: bp.Id, qbo_synced_at: new Date().toISOString() }).eq('id', pid);
    // A payment to the funding supplier (MJLB) is the RBC → TD deposit: tag it for the TD report and the week.
    const fund = (fundedAccts ?? []).find((a) => a.funding_supplier_id === sup.id);
    if (fund) await tagDeposit(admin, pid as string, fund.id, fund.funded_by, bp.TxnDate);
    payments++;
    await log(admin, { direction: 'pull', entity: 'billpayment', portal_id: pid, qbo_id: bp.Id, status: 'ok', message: `Paiement ${amount.toFixed(2)} $ importé de QB (${sup.name})` });
  }

  await admin.from('qbo_connection').update({ last_pull_cursor: startedAt.toISOString() }).eq('id', 1);
  return { bills, payments, skipped };
}

/** Mark a payment to the funding supplier as the deposit into its funded account, for the week it belongs to. */
export async function tagDeposit(admin: SupabaseClient, paymentId: string, accountId: string, funderId: string | null, paidOn: string) {
  const d = new Date(paidOn + 'T12:00:00');
  const from = new Date(d.getTime() - 6 * 86400_000).toISOString().slice(0, 10);
  const to = new Date(d.getTime() + 6 * 86400_000).toISOString().slice(0, 10);
  const { data: runs } = await admin.from('ap_runs').select('id, run_date').gte('run_date', from).lte('run_date', to);
  const run = (runs ?? []).sort((a, b) => Math.abs(new Date(a.run_date).getTime() - d.getTime()) - Math.abs(new Date(b.run_date).getTime() - d.getTime()))[0];
  await admin.from('ap_payments').update({ transfer_to_account_id: accountId, funds_run_id: run?.id ?? null, ...(funderId ? { bank_account_id: funderId } : {}) }).eq('id', paymentId);
}

// ------------------------------------------------------------------ hooks
/** Called right after a portal action; never throws (the nightly sync retries). */
export async function autoPushInvoice(admin: SupabaseClient, invoiceId: string) {
  try {
    const { data: conn } = await admin.from('qbo_connection').select('id').eq('id', 1).maybeSingle();
    if (!conn || !(await qboDefaults(admin)).push_bills) return;
    await pushInvoice(admin, invoiceId);
  } catch (e) { console.error('[qbo] auto push invoice failed:', e); }
}

export async function autoPushPayment(admin: SupabaseClient, paymentId: string) {
  try {
    const { data: conn } = await admin.from('qbo_connection').select('id').eq('id', 1).maybeSingle();
    if (!conn || !(await qboDefaults(admin)).push_payments) return;
    await pushPayment(admin, paymentId);
  } catch (e) { console.error('[qbo] auto push payment failed:', e); }
}

// ------------------------------------------------------------------ full sync
/** Push whatever is pending (created since the connection), then pull QB changes. */
export async function syncAll(admin: SupabaseClient) {
  const defaults = await qboDefaults(admin);
  const { data: conn } = await admin.from('qbo_connection').select('connected_at').eq('id', 1).maybeSingle();
  if (!conn) throw new Error('QuickBooks non connecté');
  // Fails fast (and flags the connection) when the authorization is no longer valid.
  await getQbo(admin);
  const summary = { bills: 0, billErrors: 0, payments: 0, paymentErrors: 0, pulled: { bills: 0, payments: 0, skipped: 0 } };

  if (defaults.push_bills) {
    const { data } = await admin.from('ap_invoices').select('id, qbo_error').is('qbo_bill_id', null).is('voided_at', null)
      .eq('source', 'portal').in('kind', ['invoice', 'credit']).gte('created_at', conn.connected_at);
    // Invoices waiting for a coding choice stay in the review queue.
    for (const i of (data ?? []).filter((x) => x.qbo_error !== TO_CLASSIFY)) (await pushInvoice(admin, i.id)).ok ? summary.bills++ : summary.billErrors++;
  }
  if (defaults.push_payments) {
    const { data } = await admin.from('ap_payments').select('id').is('qbo_billpayment_id', null).is('voided_at', null)
      .eq('source', 'portal').gte('created_at', conn.connected_at);
    for (const p of data ?? []) (await pushPayment(admin, p.id)).ok ? summary.payments++ : summary.paymentErrors++;
  }
  if (defaults.pull) summary.pulled = await pullFromQbo(admin);

  const status = `${summary.bills} facture(s) et ${summary.payments} paiement(s) envoyés, ${summary.pulled.bills} facture(s) et ${summary.pulled.payments} paiement(s) importés`
    + (summary.billErrors + summary.paymentErrors ? `, ${summary.billErrors + summary.paymentErrors} à corriger` : '');
  await admin.from('qbo_connection').update({ last_sync_at: new Date().toISOString(), last_sync_status: status }).eq('id', 1);
  await log(admin, { direction: 'system', entity: 'sync', status: 'ok', message: status });
  return summary;
}

/** Portal balance vs QB vendor balance for every linked supplier. */
export async function reconcile(admin: SupabaseClient) {
  const qbo = await getQbo(admin);
  if (!qbo) return [];
  const vendors = await qbo.query('Vendor');
  const byId = new Map(vendors.map((v) => [v.Id as string, v]));
  const { data: sups } = await admin.from('ap_suppliers').select('id, name, qbo_vendor_id').not('qbo_vendor_id', 'is', null);
  const { data: bals } = await admin.from('ap_supplier_balances').select('supplier_id, owed');
  const owed = new Map((bals ?? []).map((b) => [b.supplier_id, n(b.owed)]));
  return (sups ?? []).map((s) => {
    const v = byId.get(s.qbo_vendor_id!);
    const portal = owed.get(s.id) ?? 0;
    const qb = v ? n(v.Balance) : null;
    return { id: s.id, name: s.name, qboName: v?.DisplayName ?? '?', portal, qb, diff: qb === null ? null : round2(portal - qb) };
  }).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));
}

/** Lists for the settings screen: expense accounts, bank accounts, tax codes, vendors. */
let listsCache: { at: number; value: Awaited<ReturnType<typeof loadLists>> } | null = null;

export async function qboLists(admin: SupabaseClient, opts: { fresh?: boolean } = {}) {
  if (!opts.fresh && listsCache && Date.now() - listsCache.at < 10 * 60_000) return listsCache.value;
  const value = await loadLists(admin);
  if (value) listsCache = { at: Date.now(), value };
  return value;
}

async function loadLists(admin: SupabaseClient) {
  const qbo = await getQbo(admin);
  if (!qbo) return null;
  const [accounts, taxCodes, vendors] = await Promise.all([
    qbo.query('Account', 'Active = true'),
    qbo.query('TaxCode', 'Active = true'),
    qbo.query('Vendor', 'Active = true'),
  ]);
  const pick = (types: string[]) => accounts.filter((a) => types.includes(a.AccountType))
    .map((a) => ({ id: a.Id as string, name: (a.FullyQualifiedName ?? a.Name) as string }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return {
    expenseAccounts: pick(['Expense', 'Cost of Goods Sold', 'Other Expense', 'Other Current Asset', 'Fixed Asset']),
    bankAccounts: pick(['Bank', 'Credit Card']),
    taxCodes: taxCodes.map((t) => ({ id: t.Id as string, name: t.Name as string })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    vendors: vendors.map((v) => ({ id: v.Id as string, name: v.DisplayName as string, balance: n(v.Balance) })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}
