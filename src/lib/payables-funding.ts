// Weekly deposit into a funded account (TD MJLB, funded by RBC). Once the
// week's TD payments are made, the deposit covering them is recorded as a
// payment from the funder (RBC) to the account's funding supplier (MJLB) —
// applied to MJLB's open bills and pushed to QuickBooks like any payment —
// tagged with the account it funds so it shows as money in on TD's report.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAccounts, logEvent, n, nextPaymentReference, round2, weekLabel } from './payables';

export interface FundingStatus {
  accountId: string;
  accountName: string;
  funderId: string;
  funderName: string;
  supplierId: string | null;
  /** TD payments recorded in this week. */
  paid: number;
  /** Deposits already recorded for this week. */
  deposited: number;
  pending: number;
  lastPaidOn: string | null;
  deposits: Array<{ id: string; amount: number; paid_on: string; reference: string | null }>;
}

export async function fundingStatus(admin: SupabaseClient, runId: string): Promise<FundingStatus[]> {
  const accounts = await loadAccounts(admin);
  const funded = accounts.filter((a) => a.funded_by);
  if (!funded.length) return [];
  const { data: lines } = await admin.from('ap_run_lines').select('payment_id').eq('run_id', runId).not('payment_id', 'is', null);
  const ids = (lines ?? []).map((l) => l.payment_id as string);
  const { data: pays } = ids.length
    ? await admin.from('ap_payments').select('amount, paid_on, bank_account_id').in('id', ids).is('voided_at', null)
    : { data: [] };
  const { data: deps } = await admin.from('ap_payments').select('id, amount, paid_on, reference, transfer_to_account_id')
    .eq('funds_run_id', runId).is('voided_at', null).order('created_at');
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  return funded.map((a) => {
    const mine = (pays ?? []).filter((p) => p.bank_account_id === a.id);
    const paid = round2(mine.reduce((t, p) => t + n(p.amount), 0));
    const depList = (deps ?? []).filter((d) => d.transfer_to_account_id === a.id)
      .map((d) => ({ id: d.id, amount: n(d.amount), paid_on: d.paid_on, reference: d.reference }));
    const deposited = round2(depList.reduce((t, d) => t + d.amount, 0));
    return {
      accountId: a.id, accountName: a.name, funderId: a.funded_by!, funderName: name.get(a.funded_by!) ?? '?',
      supplierId: (a as unknown as { funding_supplier_id: string | null }).funding_supplier_id ?? null,
      paid, deposited, pending: round2(paid - deposited),
      lastPaidOn: mine.map((p) => p.paid_on).sort().pop() ?? null, deposits: depList,
    };
  });
}

/** Record the deposits still due for this week. Returns what was recorded. */
export async function recordFundingDeposits(admin: SupabaseClient, runId: string, staffId: string) {
  const { data: run } = await admin.from('ap_runs').select('run_date').eq('id', runId).maybeSingle();
  const done: Array<{ account: string; amount: number; reference: string | null }> = [];
  for (const f of await fundingStatus(admin, runId)) {
    if (!f.supplierId || f.pending < 0.005) continue;
    const reference = await nextPaymentReference(admin);
    const { data: sup } = await admin.from('ap_suppliers').select('payment_method').eq('id', f.supplierId).maybeSingle();
    const { data: pid, error } = await admin.rpc('ap_record_payment', {
      p_supplier_id: f.supplierId, p_amount: f.pending, p_paid_on: f.lastPaidOn ?? new Date().toISOString().slice(0, 10),
      p_method: sup?.payment_method ?? 'eft', p_bank_account_id: f.funderId, p_reference: reference ?? '',
      p_notes: `Dépôt ${f.funderName} → ${f.accountName}${run ? ` — semaine du ${weekLabel(run.run_date)}` : ''}`,
      p_staff_id: staffId, p_run_line_id: null,
    });
    if (error || !pid) {
      console.error('[paiements] funding deposit failed:', error);
      continue;
    }
    await admin.from('ap_payments').update({ transfer_to_account_id: f.accountId, funds_run_id: runId }).eq('id', pid);
    await logEvent(admin, {
      run_id: runId, supplier_id: f.supplierId, actor_staff_id: staffId, action: 'funding_deposit',
      details: { amount: f.pending, from: f.funderName, to: f.accountName, reference },
    });
    done.push({ account: f.accountName, amount: f.pending, reference });
  }
  return done;
}

/** Suppliers that receive funding deposits (kept out of the weekly payment lines). */
export async function fundingSupplierIds(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin.from('ap_bank_accounts').select('funding_supplier_id').not('funding_supplier_id', 'is', null);
  return new Set((data ?? []).map((r) => r.funding_supplier_id as string));
}
