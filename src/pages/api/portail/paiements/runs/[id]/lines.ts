import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { json, isUuid, parseAmount, logEvent } from '../../../../../../lib/payables';

export const prerender = false;

// Autosave one supplier's line in a run: the suggested amount/note while the
// run is being prepared, or the approved amount once it's approved (a staff
// correction after Jorge's approval — always logged with the old value).
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const runId = String(params.id ?? '');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isUuid(runId) || !body || !isUuid(body.supplier_id)) return json({ error: 'bad request' }, 400);

  const admin = getAdminClient();
  const { data: run } = await admin.from('ap_runs').select('id, status').eq('id', runId).maybeSingle();
  if (!run) return json({ error: 'not found' }, 404);
  const { data: existing } = await admin.from('ap_run_lines').select('*')
    .eq('run_id', runId).eq('supplier_id', body.supplier_id).maybeSingle();

  const patch: Record<string, unknown> = {};
  if ('suggested_amount' in body || 'suggested_note' in body) {
    if (run.status !== 'draft') return json({ error: 'locked' }, 409);
    if ('suggested_amount' in body) {
      const v = parseAmount(body.suggested_amount);
      if (v !== null && v < 0) return json({ error: 'negative' }, 400);
      patch.suggested_amount = v;
    }
    if ('suggested_note' in body) patch.suggested_note = String(body.suggested_note ?? '').trim() || null;
  }
  if ('approved_amount' in body) {
    if (run.status !== 'approved') return json({ error: 'locked' }, 409);
    if (existing?.payment_id) return json({ error: 'already paid' }, 409);
    const v = parseAmount(body.approved_amount);
    if (v !== null && v < 0) return json({ error: 'negative' }, 400);
    patch.approved_amount = v;
  }
  if (Object.keys(patch).length === 0) return json({ error: 'nothing to save' }, 400);

  const merged = { ...(existing ?? {}), ...patch };
  const empty = !merged.suggested_amount && !merged.suggested_note && merged.approved_amount == null && !merged.payment_id;
  if (empty) {
    if (existing) await admin.from('ap_run_lines').delete().eq('id', existing.id);
    return json({ line: null });
  }

  const { data: line, error } = existing
    ? await admin.from('ap_run_lines').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', existing.id).select('*').single()
    : await admin.from('ap_run_lines').insert({ run_id: runId, supplier_id: body.supplier_id, ...patch }).select('*').single();
  if (error) {
    console.error('[paiements] line save failed:', error);
    return json({ error: 'save failed' }, 500);
  }
  if ('approved_amount' in patch) {
    await logEvent(admin, {
      run_id: runId, supplier_id: String(body.supplier_id), actor_staff_id: staff.id, action: 'approved_amount_changed',
      details: { from: existing?.approved_amount ?? null, to: patch.approved_amount },
    });
  }
  return json({ line });
};
