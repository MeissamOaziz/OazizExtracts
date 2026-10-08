import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { isUuid, json, logEvent } from '../../../../../../lib/payables';
import { DUE_STATUS_EDITORS } from '../../../../../../lib/access';

export const prerender = false;

const STATUSES = ['not_due', 'unpaid', 'paid'] as const;

// Manual payment status of a supplier (weekly page status column).
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  if (!DUE_STATUS_EDITORS.includes(staff.email.toLowerCase())) return json({ error: 'forbidden' }, 403);
  const id = String(params.id ?? '');
  const body = await request.json().catch(() => null) as { status?: string } | null;
  const status = body?.status === 'auto' ? null : (STATUSES as readonly string[]).includes(body?.status ?? '') ? body!.status! : undefined;
  if (!isUuid(id) || status === undefined) return json({ error: 'invalid' }, 400);

  const admin = getAdminClient();
  const { data: before } = await admin.from('ap_suppliers').select('due_status').eq('id', id).maybeSingle();
  if (!before) return json({ error: 'not found' }, 404);
  const { error } = await admin.from('ap_suppliers').update({
    due_status: status, due_status_by: staff.id, due_status_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  await logEvent(admin, { supplier_id: id, actor_staff_id: staff.id, action: 'due_status_changed', details: { from: before.due_status, to: status } });
  return json({ ok: true, status });
};
