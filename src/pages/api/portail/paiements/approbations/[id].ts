import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { json, isUuid, loadRun } from '../../../../../lib/payables';
import { submitApproval } from '../../../../../lib/payables-approval';

export const prerender = false;

// Approval submitted by the approver while logged in. Only the person the run
// was sent to can approve it; everyone else with access sees it read-only.
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  if (!isUuid(params.id)) return json({ error: 'not found' }, 404);
  const admin = getAdminClient();
  const loaded = await loadRun(admin, params.id);
  if (!loaded) return json({ error: 'not found' }, 404);
  if ((loaded.run.approver_email ?? '').toLowerCase() !== staff.email.toLowerCase()) {
    return json({ error: "Cette semaine a été envoyée à un autre approbateur." }, 403);
  }
  const body = await request.json().catch(() => null);
  const res = await submitApproval(admin, loaded, body, {
    label: staff.full_name, staffId: staff.id, via: 'portal', ip: request.headers.get('x-forwarded-for'),
  });
  return res.ok ? json({ ok: true }) : json({ error: res.error }, res.status);
};
