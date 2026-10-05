import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { json, isUuid, parseAmount, CASH_KINDS } from '../../../../../../lib/payables';

export const prerender = false;

// Create / update / delete a cash line (bank balance, payroll, credit card…).
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const runId = String(params.id ?? '');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isUuid(runId) || !body) return json({ error: 'bad request' }, 400);

  const admin = getAdminClient();
  const { data: run } = await admin.from('ap_runs').select('status').eq('id', runId).maybeSingle();
  if (!run) return json({ error: 'not found' }, 404);
  if (run.status === 'closed') return json({ error: 'closed' }, 409);

  if (isUuid(body.delete)) {
    await admin.from('ap_run_cash_lines').delete().eq('id', body.delete).eq('run_id', runId);
    return json({ ok: true });
  }

  if (isUuid(body.id)) {
    const patch: Record<string, unknown> = {};
    if ('label' in body) patch.label = String(body.label ?? '').trim() || '—';
    if ('amount' in body) patch.amount = parseAmount(body.amount);
    if ('as_of' in body) patch.as_of = /^\d{4}-\d{2}-\d{2}$/.test(String(body.as_of ?? '')) ? body.as_of : null;
    const { data: line, error } = await admin.from('ap_run_cash_lines').update(patch)
      .eq('id', body.id).eq('run_id', runId).select('*').single();
    if (error) return json({ error: 'save failed' }, 500);
    return json({ line });
  }

  if (!isUuid(body.bank_account_id)) return json({ error: 'bad request' }, 400);
  const kind = (CASH_KINDS as readonly string[]).includes(String(body.kind)) ? String(body.kind) : 'other';
  const { count } = await admin.from('ap_run_cash_lines').select('id', { count: 'exact', head: true }).eq('run_id', runId);
  const { data: line, error } = await admin.from('ap_run_cash_lines').insert({
    run_id: runId, bank_account_id: body.bank_account_id, kind,
    label: String(body.label ?? '').trim() || '—', sort_order: (count ?? 0) + 1,
  }).select('*').single();
  if (error) return json({ error: 'save failed' }, 500);
  return json({ line });
};
