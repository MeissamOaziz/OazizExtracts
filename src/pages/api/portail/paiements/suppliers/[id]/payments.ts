import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { isUuid, logEvent, parseAmount, paymentWithReference, todayIso, PAYMENT_METHODS } from '../../../../../../lib/payables';
import { autoPushPayment, deleteQboPayment } from '../../../../../../lib/qbo-sync';

export const prerender = false;

// Record a payment made outside a weekly run (automatic withdrawals, urgent
// payments…), void one, or toggle its remittance tick.
export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const supplierId = String(params.id ?? '');
  if (!isUuid(supplierId)) return redirect('/portail/paiements/fournisseurs', 303);
  const back = `/portail/paiements/fournisseurs/${supplierId}`;
  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const admin = getAdminClient();
  const paymentId = String(form.get('payment_id') ?? '');

  if (action === 'remittance' && isUuid(paymentId)) {
    const sent = form.get('sent') === 'on';
    const stamp = sent ? { remittance_sent_at: new Date().toISOString(), remittance_sent_by: staff.id } : { remittance_sent_at: null, remittance_sent_by: null };
    await admin.from('ap_payments').update(stamp).eq('id', paymentId).eq('supplier_id', supplierId);
    await admin.from('ap_run_lines').update(stamp).eq('payment_id', paymentId);
    return redirect(back, 303);
  }

  if (action === 'void' && isUuid(paymentId)) {
    await deleteQboPayment(admin, paymentId);
    const { error } = await admin.rpc('ap_void_payment', { p_payment_id: paymentId, p_staff_id: staff.id });
    if (error) console.error('[paiements] void payment failed:', error);
    await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'payment_voided', details: { payment_id: paymentId } });
    return redirect(`${back}?ok=payvoid`, 303);
  }

  const amount = parseAmount(form.get('amount'));
  if (!amount || amount <= 0) return redirect(`${back}?error=missing`, 303);
  const method = String(form.get('payment_method'));
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('paid_on') ?? '')) ? String(form.get('paid_on')) : todayIso();
  const invoiceIds = form.getAll('invoice_ids').map(String).filter(isUuid);
  const ref = String(form.get('reference') ?? '').trim();
  const d = await paymentWithReference(admin, ref);
  if (d) return redirect(`${back}?error=${encodeURIComponent(`Référence ${ref} déjà utilisée — ${d.supplier ?? ''}, ${d.amount.toFixed(2)} $, ${d.paidOn}`)}`, 303);
  const { data: newId, error } = await admin.rpc('ap_record_payment', {
    p_supplier_id: supplierId, p_amount: amount, p_paid_on: paidOn,
    p_method: (PAYMENT_METHODS as readonly string[]).includes(method) ? method : null,
    p_bank_account_id: isUuid(form.get('bank_account_id')) ? form.get('bank_account_id') : null,
    p_reference: ref, p_notes: String(form.get('notes') ?? ''),
    p_staff_id: staff.id, p_run_line_id: null, p_invoice_ids: invoiceIds.length ? invoiceIds : null,
  });
  if (error) {
    console.error('[paiements] record payment failed:', error);
    return redirect(`${back}?error=missing`, 303);
  }
  await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'payment_recorded', details: { amount, paid_on: paidOn, reference: ref || null } });
  if (newId && form.get('already_in_qbo') !== 'on') await autoPushPayment(admin, newId as string);
  return redirect(`${back}?ok=pay`, 303);
};
