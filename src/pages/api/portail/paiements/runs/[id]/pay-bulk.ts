import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { json, isUuid, parseAmount, logEvent, todayIso, round2 } from '../../../../../../lib/payables';
import { autoPushPayment } from '../../../../../../lib/qbo-sync';

export const prerender = false;

// Pay several approved lines at once with one date and one reference (how
// payments are usually released at the bank). Payments are recorded first;
// QuickBooks bill payments follow within a time budget, and anything left is
// picked up by "Sync now" or the nightly sync.
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const runId = String(params.id ?? '');
  const body = await request.json().catch(() => null) as { lines?: Array<{ line_id?: unknown; amount?: unknown }>; paid_on?: unknown; reference?: unknown } | null;
  if (!isUuid(runId) || !body || !Array.isArray(body.lines) || body.lines.length === 0) return json({ error: 'bad request' }, 400);

  const admin = getAdminClient();
  const { data: run } = await admin.from('ap_runs').select('status').eq('id', runId).maybeSingle();
  if (!run) return json({ error: 'not found' }, 404);
  if (run.status !== 'approved') return json({ error: 'run not approved' }, 409);
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.paid_on ?? '')) ? String(body.paid_on) : todayIso();
  const reference = String(body.reference ?? '').trim();

  const results: Array<{ line_id: string; ok: boolean; error?: string; payment_id?: string }> = [];
  const created: string[] = [];
  for (const raw of body.lines) {
    const lineId = String(raw.line_id ?? '');
    const amount = parseAmount(raw.amount);
    if (!isUuid(lineId) || !amount || amount <= 0) { results.push({ line_id: lineId, ok: false, error: 'montant invalide' }); continue; }
    const { data: line } = await admin.from('ap_run_lines').select('*').eq('id', lineId).eq('run_id', runId).maybeSingle();
    if (!line) { results.push({ line_id: lineId, ok: false, error: 'introuvable' }); continue; }
    if (line.payment_id) { results.push({ line_id: lineId, ok: false, error: 'déjà payé' }); continue; }
    if (!(Number(line.approved_amount) > 0)) { results.push({ line_id: lineId, ok: false, error: 'non approuvé' }); continue; }
    const { data: sup } = await admin.from('ap_suppliers').select('payment_method, bank_account_id').eq('id', line.supplier_id).single();
    const { data: paymentId, error } = await admin.rpc('ap_record_payment', {
      p_supplier_id: line.supplier_id, p_amount: amount, p_paid_on: paidOn,
      p_method: sup?.payment_method ?? null, p_bank_account_id: sup?.bank_account_id ?? null,
      p_reference: reference, p_notes: '', p_staff_id: staff.id, p_run_line_id: line.id,
    });
    if (error || !paymentId) { results.push({ line_id: lineId, ok: false, error: error?.message ?? 'échec' }); continue; }
    await admin.from('ap_run_lines').update({ payment_id: paymentId, processed_at: new Date().toISOString(), processed_by: staff.id }).eq('id', line.id);
    await logEvent(admin, { run_id: runId, supplier_id: line.supplier_id, actor_staff_id: staff.id, action: 'paid', details: { amount, paid_on: paidOn, reference: reference || null, bulk: true } });
    created.push(paymentId as string);
    results.push({ line_id: lineId, ok: true, payment_id: paymentId as string });
  }

  // QuickBooks: push within ~35 s; the rest goes out with the next sync.
  const started = Date.now();
  let pushed = 0;
  for (const pid of created) {
    if (Date.now() - started > 35_000) break;
    await autoPushPayment(admin, pid);
    pushed++;
  }
  const total = round2(body.lines.reduce((s, l) => s + (parseAmount(l.amount) ?? 0), 0));
  return json({ ok: true, results, paid: created.length, qbPushed: pushed, qbPending: created.length - pushed, total });
};
