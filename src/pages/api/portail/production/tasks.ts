import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { UNITS, STATUSES, isIsoDate, isReason, parseQty, saveErrorCode } from '../../../../lib/production';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

// Create or edit a production task. All the rules (reason required when the
// schedule moves, stale-version guard, logging) live in ps_save_task().
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);

  const form = await request.formData();
  const action = str(form, '_action') === 'edit' ? 'edit' : 'create';
  const id = str(form, 'id');
  if (action === 'edit' && !UUID.test(id)) return redirect('/portail/production', 303);
  const fail = (code: string) => redirect(
    action === 'edit' ? `/portail/production/${id}?error=${code}#modifier` : `/portail/production/nouvelle?error=${code}`, 303);

  const data: Record<string, string> = {
    production_type_id: str(form, 'production_type_id'),
    room_id: str(form, 'room_id'),
    start_date: str(form, 'start_date'),
    end_date: str(form, 'end_date'),
    groweriq_lot_id: str(form, 'groweriq_lot_id'),
    groweriq_batch_id: str(form, 'groweriq_batch_id'),
    notes: str(form, 'notes'),
    priority: form.get('rush') ? 'rush' : 'normal',
  };
  if (!UUID.test(data.production_type_id) || !UUID.test(data.room_id)
      || !isIsoDate(data.start_date) || !isIsoDate(data.end_date)) return fail('MISSING_FIELDS');

  if (action === 'edit') {
    const status = str(form, 'status');
    if ((STATUSES as readonly string[]).includes(status)) data.status = status;
    for (const k of ['actual_start_date', 'actual_end_date']) {
      const v = str(form, k);
      if (v !== '' && !isIsoDate(v)) return fail('MISSING_FIELDS');
      data[k] = v;
    }
  }

  // Input lines arrive as parallel lists; blank material = blank line.
  const materials = form.getAll('in_material').map(String);
  const lots = form.getAll('in_lot').map(String);
  const qtys = form.getAll('in_qty').map(String);
  const units = form.getAll('in_unit').map(String);
  const inputs: Array<{ material: string; groweriq_lot_id: string; quantity: string; unit: string }> = [];
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i].trim();
    if (!material) continue;
    const q = parseQty(qtys[i] ?? '');
    if (Number.isNaN(q) || q === 0) return fail('BAD_INPUT');
    const unit = (UNITS as readonly string[]).includes(units[i]) ? units[i] : 'g';
    inputs.push({ material, groweriq_lot_id: (lots[i] ?? '').trim(), quantity: q === null ? '' : String(q), unit });
  }

  const reason = str(form, 'reason');
  const expected = Number(str(form, 'version'));
  const { data: out, error } = await getAdminClient().rpc('ps_save_task', {
    p_id: action === 'edit' ? id : null,
    p_expected_version: action === 'edit' && Number.isInteger(expected) ? expected : null,
    p_data: data,
    p_inputs: inputs,
    p_staff: staff.id,
    p_reason: isReason(reason) ? reason : null,
    p_note: str(form, 'reason_note') || null,
  });
  if (error) {
    const code = saveErrorCode(error);
    if (code === 'UNKNOWN') console.error('[production] save failed:', error);
    return fail(code);
  }
  const row = Array.isArray(out) ? out[0] : out;
  if (action === 'create') return redirect(`/portail/production/${row.out_id}?ok=created`, 303);
  return redirect(`/portail/production/${id}?ok=${row.out_version === expected ? 'nochange' : 'saved'}`, 303);
};
