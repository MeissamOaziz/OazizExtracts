import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { STATUSES, isReason, saveErrorCode } from '../../../../lib/production';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One-click status moves from the list and the task page (start, finish,
// pause, resume, cancel). Pausing and cancelling carry a reason.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);

  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '');
  const backRaw = String(form.get('_back') ?? '');
  // Only ever bounce back inside the module.
  const back = /^\/portail\/production(\/|\?|$)/.test(backRaw) ? backRaw : `/portail/production/${id}`;
  // Back to where the button was, with a fresh ok/error flag.
  const withFlag = (key: 'ok' | 'error', value: string) => {
    const u = new URL(back, 'http://x');
    u.searchParams.delete('ok'); u.searchParams.delete('error');
    u.searchParams.set(key, value);
    return u.pathname + u.search + u.hash;
  };
  if (!UUID.test(id) || !(STATUSES as readonly string[]).includes(status)) return redirect(back, 303);

  const reason = String(form.get('reason') ?? '');
  const version = Number(form.get('version'));
  const { error } = await getAdminClient().rpc('ps_save_task', {
    p_id: id,
    p_expected_version: Number.isInteger(version) ? version : null,
    p_data: { status },
    p_inputs: null,
    p_staff: staff.id,
    p_reason: isReason(reason) ? reason : null,
    p_note: String(form.get('reason_note') ?? '').trim() || null,
  });
  if (error) {
    const code = saveErrorCode(error);
    if (code === 'UNKNOWN') console.error('[production] status failed:', error);
    return redirect(withFlag('error', code), 303);
  }
  return redirect(withFlag('ok', 'status'), 303);
};
