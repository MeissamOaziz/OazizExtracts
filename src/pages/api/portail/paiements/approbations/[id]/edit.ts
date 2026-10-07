import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { localizeMsg } from '../../../../../../lib/msg-i18n';
import { getPortailLocale } from '../../../../../../lib/portail-i18n';
import { json, isUuid, loadRun, logEvent, n, round2, paymentAmounts } from '../../../../../../lib/payables';
import { autoPushPayment, deleteQboPayment } from '../../../../../../lib/qbo-sync';

export const prerender = false;

// Correct an approved week (Meissam/Nathalie only — full 'payables' access).
// Every changed amount is logged with who/when/old/new and the reason, so the
// approvals page shows a complete change history. A corrected payment (amount
// or date) voids the old payment and records the corrected one — balances,
// bank totals and QuickBooks follow; clearing the paid amount undoes it.
export const POST: APIRoute = async ({ request, cookies, params, locals }) => {
  const L = (m: string) => localizeMsg(m, getPortailLocale(cookies));
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: L('unauthenticated') }, 401);
  if (!locals.access?.perms.has('payables')) return json({ error: L('Accès refusé') }, 403);
  if (!isUuid(params.id)) return json({ error: L('not found') }, 404);

  const admin = getAdminClient();
  const loaded = await loadRun(admin, params.id);
  if (!loaded) return json({ error: L('not found') }, 404);
  const { run, lines } = loaded;
  if (run.status !== 'approved' && run.status !== 'closed') return json({ error: L('La semaine n’est pas approuvée.') }, 409);

  const body = await request.json().catch(() => null) as { lines?: Array<Record<string, unknown>>; comment?: unknown } | null;
  const reason = String(body?.comment ?? '').trim().slice(0, 1000);
  if (!body || !Array.isArray(body.lines)) return json({ error: L('Requête invalide.') }, 400);
  if (!reason) return json({ error: L('Indiquez la raison de la modification.') }, 400);

  const bySupplier = new Map(lines.map((l) => [l.supplier_id, l]));
  const paidAmt = await paymentAmounts(admin, lines.map((l) => l.payment_id).filter((x): x is string => !!x));
  const { data: payRows } = await admin.from('ap_payments').select('id, paid_on, reference')
    .in('id', lines.map((l) => l.payment_id).filter((x): x is string => !!x).concat(['00000000-0000-0000-0000-000000000000']));
  const payInfo = new Map((payRows ?? []).map((p) => [p.id, p]));
  let changed = 0;
  const skipped: string[] = [];
  const toPush: string[] = [];

  // Correct / record / undo the payment of one line.
  async function correctPayment(line: (typeof lines)[number], paid: number, paidOn: string) {
    const oldId = line.payment_id;
    const oldAmount = oldId ? n(paidAmt.get(oldId)) : 0;
    const oldDate = oldId ? payInfo.get(oldId)?.paid_on ?? null : null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : (oldDate ?? new Date().toISOString().slice(0, 10));
    const same = oldId ? Math.abs(oldAmount - paid) < 0.005 && date === oldDate : paid <= 0;
    if (same) return false;
    const reference = oldId ? payInfo.get(oldId)?.reference ?? '' : '';
    if (oldId) {
      await deleteQboPayment(admin, oldId);
      const { error } = await admin.rpc('ap_void_payment', { p_payment_id: oldId, p_staff_id: staff!.id });
      if (error) throw error;
    }
    let newId: string | null = null;
    if (paid > 0) {
      const { data: sup } = await admin.from('ap_suppliers').select('payment_method, bank_account_id').eq('id', line.supplier_id).single();
      const { data, error } = await admin.rpc('ap_record_payment', {
        p_supplier_id: line.supplier_id, p_amount: paid, p_paid_on: date,
        p_method: sup?.payment_method ?? null, p_bank_account_id: sup?.bank_account_id ?? null,
        p_reference: reference, p_notes: 'Correction', p_staff_id: staff!.id, p_run_line_id: line.id,
      });
      if (error || !data) throw error ?? new Error('payment failed');
      newId = data as string;
      await admin.from('ap_run_lines').update({ payment_id: newId, processed_at: new Date().toISOString(), processed_by: staff!.id }).eq('id', line.id);
      toPush.push(newId);
    }
    await logEvent(admin, {
      run_id: run.id, supplier_id: line.supplier_id, actor_staff_id: staff!.id,
      action: oldId && paid > 0 ? 'payment_corrected' : paid > 0 ? 'paid' : 'payment_voided',
      details: { from: oldId ? oldAmount : null, to: paid > 0 ? paid : null, from_date: oldDate, to_date: paid > 0 ? date : null, amount: paid || null, paid_on: date, reason },
    });
    return true;
  }
  for (const raw of body.lines) {
    if (!isUuid(raw.supplier_id)) continue;
    const approved = round2(Number(raw.approved));
    if (!Number.isFinite(approved) || approved < 0) return json({ error: L('Montant invalide.') }, 400);
    const note = String(raw.note ?? '').trim().slice(0, 500) || null;
    const existing = bySupplier.get(raw.supplier_id);

    if (existing) {
      const before = existing.approved_amount === null ? null : n(existing.approved_amount);
      const amountChanged = before === null ? approved !== 0 : Math.abs(before - approved) >= 0.005;
      const noteChanged = (existing.approver_note ?? null) !== note;
      if (amountChanged || noteChanged) {
        await admin.from('ap_run_lines').update({ approved_amount: approved, approver_note: note, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (amountChanged) {
          await logEvent(admin, {
            run_id: run.id, supplier_id: raw.supplier_id, actor_staff_id: staff.id, action: 'approved_amount_changed',
            details: { from: before, to: approved, reason },
          });
        }
        changed++;
      }
      if ('paid' in raw) {
        const paid = round2(Number(raw.paid));
        if (!Number.isFinite(paid) || paid < 0) return json({ error: L('Montant payé invalide.') }, 400);
        try {
          if (await correctPayment(existing, paid, String(raw.paid_on ?? ''))) changed++;
        } catch (err) {
          console.error('[paiements] payment correction failed:', err);
          skipped.push(raw.supplier_id);
        }
      }
    } else if (approved > 0) {
      const { data: sup } = await admin.from('ap_suppliers').select('id').eq('id', raw.supplier_id).maybeSingle();
      if (!sup) continue;
      await admin.from('ap_run_lines').insert({ run_id: run.id, supplier_id: raw.supplier_id, approved_amount: approved, approver_note: note });
      await logEvent(admin, {
        run_id: run.id, supplier_id: raw.supplier_id, actor_staff_id: staff.id, action: 'approval_line_added',
        details: { to: approved, reason },
      });
      changed++;
    }
  }
  if (changed) {
    await logEvent(admin, { run_id: run.id, actor_staff_id: staff.id, action: 'approval_edited', details: { lines: changed, reason } });
  }
  // Corrected payments go to QuickBooks (within a time budget; the rest at the next sync).
  const started = Date.now();
  for (const pid of toPush) {
    if (Date.now() - started > 30_000) break;
    await autoPushPayment(admin, pid);
  }
  return json({ ok: true, changed, skipped: skipped.length });
};
