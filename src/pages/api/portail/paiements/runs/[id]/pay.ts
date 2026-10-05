import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { json, isUuid, parseAmount, logEvent, todayIso } from '../../../../../../lib/payables';
import { autoPushPayment, deleteQboPayment } from '../../../../../../lib/qbo-sync';

export const prerender = false;

// Mark an approved line as paid (records the payment, allocated oldest-first),
// or undo it (voids the payment — never deletes — and restores the balance).
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const runId = String(params.id ?? '');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isUuid(runId) || !body || !isUuid(body.line_id)) return json({ error: 'bad request' }, 400);

  const admin = getAdminClient();
  const { data: run } = await admin.from('ap_runs').select('status').eq('id', runId).maybeSingle();
  const { data: line } = await admin.from('ap_run_lines').select('*').eq('id', body.line_id).eq('run_id', runId).maybeSingle();
  if (!run || !line) return json({ error: 'not found' }, 404);

  if (body.undo) {
    if (!line.payment_id) return json({ ok: true });
    await deleteQboPayment(admin, line.payment_id);
    const { error } = await admin.rpc('ap_void_payment', { p_payment_id: line.payment_id, p_staff_id: staff.id });
    if (error) return json({ error: error.message }, 500);
    await admin.from('ap_run_lines').update({ remittance_sent_at: null, remittance_sent_by: null }).eq('id', line.id);
    await logEvent(admin, { run_id: runId, supplier_id: line.supplier_id, actor_staff_id: staff.id, action: 'payment_voided', details: { payment_id: line.payment_id } });
    return json({ ok: true });
  }

  if (run.status !== 'approved') return json({ error: 'run not approved' }, 409);
  if (line.payment_id) return json({ error: 'already paid' }, 409);
  if (!(Number(line.approved_amount) > 0)) return json({ error: 'not approved' }, 409);
  const amount = parseAmount(body.amount);
  if (!amount || amount <= 0) return json({ error: 'amount' }, 400);
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paid_on ?? '')) ? String(body.paid_on) : todayIso();

  const { data: sup } = await admin.from('ap_suppliers').select('payment_method, bank_account_id').eq('id', line.supplier_id).single();
  const { data: paymentId, error } = await admin.rpc('ap_record_payment', {
    p_supplier_id: line.supplier_id, p_amount: amount, p_paid_on: paidOn,
    p_method: sup?.payment_method ?? null, p_bank_account_id: sup?.bank_account_id ?? null,
    p_reference: String(body.reference ?? ''), p_notes: '', p_staff_id: staff.id, p_run_line_id: line.id,
  });
  if (error || !paymentId) {
    console.error('[paiements] record payment failed:', error);
    return json({ error: error?.message ?? 'failed' }, 500);
  }
  await admin.from('ap_run_lines').update({
    payment_id: paymentId, processed_at: new Date().toISOString(), processed_by: staff.id,
  }).eq('id', line.id);
  await logEvent(admin, {
    run_id: runId, supplier_id: line.supplier_id, actor_staff_id: staff.id, action: 'paid',
    details: { amount, paid_on: paidOn, reference: body.reference || null },
  });
  await autoPushPayment(admin, paymentId as string);
  return json({ ok: true, payment_id: paymentId });
};
