import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { getPortailLocale, makeT } from '../../../../../../lib/portail-i18n';
import { frPaiements, enPaiements } from '../../../../../../i18n/portail/paiements';
import {
  isUuid, loadRun, loadAccounts, loadSuppliers, computeCash, previousRun, getSetting, logEvent,
  mintApproval, approvalUrl, approvalsPortalUrl, money, n, weekLabel, type ApproverSetting,
} from '../../../../../../lib/payables';
import { sendPaymentApprovalRequest } from '../../../../../../lib/email';

export const prerender = false;

// Run lifecycle: submit to the approver, resend, recall, manual approval,
// close / reopen, and carrying over last week's unpaid approvals.
export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const runId = String(params.id ?? '');
  if (!isUuid(runId)) return redirect('/portail/paiements', 303);
  const T = makeT(getPortailLocale(cookies), frPaiements, enPaiements);
  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

  const back = `/portail/paiements/semaine/${runId}`;
  const go = (kind: 'ok' | 'error' | 'info', msg: string) => redirect(`${back}?${kind}=${encodeURIComponent(msg)}`, 303);

  const admin = getAdminClient();
  const loaded = await loadRun(admin, runId);
  if (!loaded) return redirect('/portail/paiements', 303);
  const { run, lines, cash } = loaded;
  const action = String((await request.formData()).get('_action') ?? '');
  const now = new Date().toISOString();

  async function sendRequest(resend: boolean) {
    const approver = await getSetting<ApproverSetting | null>(admin, 'approver', null);
    if (!approver?.email) return go('error', T('submit.noApprover'));
    const suggested = lines.filter((l) => n(l.suggested_amount) > 0);
    if (suggested.length === 0) return go('error', T('submit.noLines'));

    const [accounts, suppliers] = await Promise.all([loadAccounts(admin), loadSuppliers(admin, { includeInactive: true })]);
    const supMap = new Map(suppliers.map((s) => [s.id, s]));
    if (!resend) {
      // Snapshot what each supplier was owed when the request went out.
      await Promise.all(lines.map((l) => admin.from('ap_run_lines')
        .update({ owed_at_submit: supMap.get(l.supplier_id)?.bal.owed ?? null, approved_amount: null, approver_note: null })
        .eq('id', l.id)));
    }
    const token = mintApproval();
    const { error } = await admin.from('ap_runs').update({
      status: 'submitted', submitted_at: now, submitted_by: staff!.id,
      approver_name: approver.name, approver_email: approver.email,
      token_hash: token.hash, token_expires_at: token.expiresAt,
      approved_at: null, approved_via: null, approver_comment: null,
    }).eq('id', runId);
    if (error) return go('error', error.message);

    const cashRows = computeCash(accounts, cash, lines, supMap, new Map())
      .filter((c) => !c.account.funded_by)
      .flatMap((c) => [
        ...(c.transferPeer && c.transferSuggested ? [{ label: `Dépôt ${c.account.name} → ${c.transferPeer}`, value: money(c.transferSuggested) }] : []),
        { label: `Solde ${c.account.name} après paiements suggérés`, value: money(c.afterSuggested) },
      ]);
    const total = suggested.reduce((s, l) => s + n(l.suggested_amount), 0);
    const url = approvalUrl(token.raw);
    const result = await sendPaymentApprovalRequest({
      toEmail: approver.email, approverName: approver.name, weekLabel: weekLabel(run.run_date),
      preparedBy: staff!.full_name, count: suggested.length, totalSuggested: money(total), cashRows,
      approvalUrl: url, portalUrl: approvalsPortalUrl(), resend,
    });
    await logEvent(admin, {
      run_id: runId, actor_staff_id: staff!.id, action: resend ? 'resent' : 'submitted',
      details: { to: approver.email, count: suggested.length, total, email: result.status },
    });
    if (result.status === 'sent') return go('ok', fill(T('submit.sent'), { email: approver.email }));
    if (result.status === 'skipped_no_key') return go('info', fill(T('submit.skipped'), { url }));
    return go('error', fill(T('submit.error'), { detail: result.detail ?? '' }));
  }

  switch (action) {
    case 'submit':
      if (run.status !== 'draft') return redirect(back, 303);
      return sendRequest(false);

    case 'resend':
      if (run.status !== 'submitted') return redirect(back, 303);
      return sendRequest(true);

    case 'recall':
      if (run.status !== 'submitted') return redirect(back, 303);
      await admin.from('ap_runs').update({ status: 'draft', token_hash: null, token_expires_at: null }).eq('id', runId);
      await logEvent(admin, { run_id: runId, actor_staff_id: staff.id, action: 'recalled' });
      return go('ok', T('flash.recalled'));

    case 'manual_approve':
      if (run.status !== 'submitted') return redirect(back, 303);
      await Promise.all(lines.map((l) => admin.from('ap_run_lines').update({ approved_amount: l.suggested_amount ?? 0 }).eq('id', l.id)));
      await admin.from('ap_runs').update({
        status: 'approved', approved_at: now, approved_via: 'manual', token_hash: null, token_expires_at: null,
      }).eq('id', runId);
      await logEvent(admin, { run_id: runId, actor_staff_id: staff.id, action: 'approved_manually' });
      return go('ok', T('flash.manual'));

    case 'close':
      if (run.status !== 'approved') return redirect(back, 303);
      await admin.from('ap_runs').update({ status: 'closed', closed_at: now, closed_by: staff.id }).eq('id', runId);
      await logEvent(admin, { run_id: runId, actor_staff_id: staff.id, action: 'closed' });
      return go('ok', T('flash.closed'));

    case 'reopen':
      if (run.status !== 'closed') return redirect(back, 303);
      await admin.from('ap_runs').update({ status: run.approved_at ? 'approved' : 'draft', closed_at: null, closed_by: null }).eq('id', runId);
      await logEvent(admin, { run_id: runId, actor_staff_id: staff.id, action: 'reopened' });
      return go('ok', T('flash.reopened'));

    case 'copy_prev': {
      if (run.status !== 'draft') return redirect(back, 303);
      const prev = await previousRun(admin, run);
      if (!prev) return redirect(back, 303);
      const mine = new Map(lines.map((l) => [l.supplier_id, l]));
      const carry = prev.lines.filter((l) => n(l.approved_amount) > 0 && !l.payment_id && !n(mine.get(l.supplier_id)?.suggested_amount));
      const note = `Reporté de la semaine du ${weekLabel(prev.run.run_date)}`;
      for (const l of carry) {
        const existing = mine.get(l.supplier_id);
        if (existing) await admin.from('ap_run_lines').update({ suggested_amount: l.approved_amount, suggested_note: note }).eq('id', existing.id);
        else await admin.from('ap_run_lines').insert({ run_id: runId, supplier_id: l.supplier_id, suggested_amount: l.approved_amount, suggested_note: note });
      }
      await logEvent(admin, { run_id: runId, actor_staff_id: staff.id, action: 'carried_over', details: { count: carry.length, from: prev.run.id } });
      return go('ok', fill(T('flash.copied'), { count: carry.length }));
    }
  }
  return redirect(back, 303);
};
