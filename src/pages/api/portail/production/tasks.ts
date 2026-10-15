import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { UNITS, STATUSES, isIsoDate, isReason, loadTask, parseQty, saveErrorCode } from '../../../../lib/production';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const unitOf = (u: string | undefined) => ((UNITS as readonly string[]).includes(u ?? '') ? u! : 'g');
const qtyStr = (q: number | null) => (q === null ? '' : String(q));

// Create or edit a production task, or record its yield. All the rules
// (reason required when the schedule moves, stale-version guard, logging)
// live in ps_save_task().
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);

  const form = await request.formData();
  const rawAction = str(form, '_action');
  const action = rawAction === 'edit' || rawAction === 'yield' ? rawAction : 'create';
  const id = str(form, 'id');
  if (action !== 'create' && !UUID.test(id)) return redirect('/portail/production', 303);
  // A failed "plan this request" keeps the request on the form.
  const fromRequest = UUID.test(str(form, 'request_id')) ? `&demande=${str(form, 'request_id')}` : '';
  const fail = (code: string) => redirect(
    action === 'create' ? `/portail/production/nouvelle?error=${code}${fromRequest}`
      : `/portail/production/${id}?error=${code}#${action === 'yield' ? 'rendement' : 'modifier'}`, 303);
  const expected = Number(str(form, 'version'));
  const admin = getAdminClient();

  // -------------------------------------------------------------- yield
  // The yield card only sends the quantities really used and obtained, one
  // per existing line; the lines themselves come from the saved task.
  if (action === 'yield') {
    const task = await loadTask(admin, id);
    if (!task) return fail('NOT_FOUND');
    const used = form.getAll('used').map(String);
    const got = form.getAll('obtained').map(String);
    const inputs = [];
    for (const [i, line] of task.inputs.entries()) {
      const q = parseQty(used[i] ?? '');
      if (Number.isNaN(q)) return fail('BAD_INPUT');
      inputs.push({ material: line.material, groweriq_lot_id: line.groweriq_lot_id ?? '', quantity: qtyStr(line.quantity), actual_quantity: qtyStr(q), unit: line.unit });
    }
    const outputs = [];
    for (const [i, line] of task.outputs.entries()) {
      const q = parseQty(got[i] ?? '');
      if (Number.isNaN(q)) return fail('BAD_INPUT');
      outputs.push({ product: line.product, is_byproduct: line.is_byproduct, expected_yield_pct: qtyStr(line.expected_yield_pct), actual_quantity: qtyStr(q), unit: line.unit });
    }
    const finish = form.get('finish') === '1' && task.status !== 'done' && task.status !== 'cancelled';
    const { data: out, error } = await admin.rpc('ps_save_task', {
      p_id: id, p_expected_version: Number.isInteger(expected) ? expected : null,
      p_data: finish ? { status: 'done' } : {}, p_inputs: inputs, p_outputs: outputs,
      p_staff: staff.id, p_reason: null, p_note: null,
    });
    if (error) {
      const code = saveErrorCode(error);
      if (code === 'UNKNOWN') console.error('[production] yield save failed:', error);
      return fail(code);
    }
    const row = Array.isArray(out) ? out[0] : out;
    return redirect(`/portail/production/${id}?ok=${row.out_version === expected ? 'nochange' : 'yield'}#rendement`, 303);
  }

  // ------------------------------------------------------- create / edit
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
  // The request this task serves: set when planned from a request, editable after.
  if (form.has('request_id')) {
    const rid = str(form, 'request_id');
    if (rid === '' || UUID.test(rid)) data.request_id = rid;
  }
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

  // Input lines arrive as parallel lists; blank material = blank line. The
  // used quantity rides along hidden so editing a task never erases it.
  const materials = form.getAll('in_material').map(String);
  const lots = form.getAll('in_lot').map(String);
  const qtys = form.getAll('in_qty').map(String);
  const actuals = form.getAll('in_actual').map(String);
  const units = form.getAll('in_unit').map(String);
  const inputs = [];
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i].trim();
    if (!material) continue;
    const q = parseQty(qtys[i] ?? '');
    if (Number.isNaN(q) || q === 0) return fail('BAD_INPUT');
    const a = parseQty(actuals[i] ?? '');
    inputs.push({
      material, groweriq_lot_id: (lots[i] ?? '').trim(), quantity: qtyStr(q),
      actual_quantity: Number.isNaN(a) ? '' : qtyStr(a), unit: unitOf(units[i]),
    });
  }

  // Expected outputs, same shape.
  const products = form.getAll('out_product').map(String);
  const kinds = form.getAll('out_kind').map(String);
  const pcts = form.getAll('out_pct').map(String);
  const outUnits = form.getAll('out_unit').map(String);
  const outActuals = form.getAll('out_actual').map(String);
  const outputs = [];
  for (let i = 0; i < products.length; i++) {
    const product = products[i].trim();
    if (!product) continue;
    const p = parseQty(pcts[i] ?? '');
    if (Number.isNaN(p) || (p !== null && p > 100)) return fail('BAD_INPUT');
    const a = parseQty(outActuals[i] ?? '');
    outputs.push({
      product, is_byproduct: kinds[i] === 'by', expected_yield_pct: qtyStr(p),
      actual_quantity: Number.isNaN(a) ? '' : qtyStr(a), unit: unitOf(outUnits[i]),
    });
  }

  const reason = str(form, 'reason');
  const { data: out, error } = await admin.rpc('ps_save_task', {
    p_id: action === 'edit' ? id : null,
    p_expected_version: action === 'edit' && Number.isInteger(expected) ? expected : null,
    p_data: data,
    p_inputs: inputs,
    p_outputs: outputs,
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
