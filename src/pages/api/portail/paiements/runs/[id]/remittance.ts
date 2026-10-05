import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { json, isUuid, logEvent } from '../../../../../../lib/payables';

export const prerender = false;

// Tick / untick "remittance sent" (the QuickBooks remittance email) for a paid line.
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const runId = String(params.id ?? '');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isUuid(runId) || !body || !isUuid(body.line_id)) return json({ error: 'bad request' }, 400);

  const admin = getAdminClient();
  const { data: line } = await admin.from('ap_run_lines').select('id, supplier_id, payment_id').eq('id', body.line_id).eq('run_id', runId).maybeSingle();
  if (!line) return json({ error: 'not found' }, 404);
  if (!line.payment_id) return json({ error: 'not paid' }, 409);
  const sent = !!body.sent;
  const stamp = sent
    ? { remittance_sent_at: new Date().toISOString(), remittance_sent_by: staff.id }
    : { remittance_sent_at: null, remittance_sent_by: null };
  await admin.from('ap_run_lines').update(stamp).eq('id', line.id);
  await admin.from('ap_payments').update(stamp).eq('id', line.payment_id);
  await logEvent(admin, { run_id: runId, supplier_id: line.supplier_id, actor_staff_id: staff.id, action: sent ? 'remittance_sent' : 'remittance_unmarked' });
  return json({ ok: true });
};
