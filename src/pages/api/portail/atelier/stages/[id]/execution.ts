import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Record what a stage actually consumed, produced and lost — then complete it.
//
// Completion is delegated to ops_complete_stage(), which writes the movement
// ledger and the lot genealogy in one transaction. That is the only path by
// which traceability gets written, so it cannot be skipped or half-applied.

function num(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const stageId = String(params.id ?? '');

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier?error=no_role', 303);

  const { data: stage } = await supabase
    .from('ops_wo_stages')
    .select('id, work_order_id, status, process:ops_process_types ( output_material_id )')
    .eq('id', stageId)
    .maybeSingle();

  if (!stage) return redirect('/portail/atelier?error=unknown', 303);
  const back = `/portail/atelier/production/${stage.work_order_id}`;
  if (stage.status === 'done') return redirect(`${back}?error=already_done`, 303);

  const form = await request.formData();
  const complete = form.get('_complete') !== null;

  // ------------------------------------------------------------- inputs
  await supabase.from('ops_stage_inputs').delete().eq('stage_id', stageId);
  const inLots = form.getAll('in_lot_id');
  const inRows: any[] = [];
  for (let i = 0; i < inLots.length; i++) {
    const lotId = str(inLots[i]);
    const qty = num(form.getAll('in_qty_g')[i]);
    if (!lotId && qty === null) continue;
    inRows.push({
      stage_id: stageId,
      lot_id: lotId,
      lot_ref: str(form.getAll('in_lot_ref')[i]),
      material_id: str(form.getAll('in_material_id')[i]),
      actual_qty_g: qty,
    });
  }
  if (inRows.length) {
    const { error } = await supabase.from('ops_stage_inputs').insert(inRows);
    if (error) { console.error('[atelier] inputs failed:', error); return redirect(`${back}?error=unknown`, 303); }
  }

  // ------------------------------------------------------------ outputs
  // A blank lot on an output row means "make a new lot": the code is generated
  // from the material by trigger, and is immutable from then on.
  await supabase.from('ops_stage_outputs').delete().eq('stage_id', stageId);
  const outQtys = form.getAll('out_qty_g');
  const outRows: any[] = [];
  for (let i = 0; i < outQtys.length; i++) {
    const qty = num(outQtys[i]);
    let lotId = str(form.getAll('out_lot_id')[i]);
    const materialId = str(form.getAll('out_material_id')[i])
      ?? (stage.process as any)?.output_material_id ?? null;
    const isNew = String(form.getAll('out_new')[i] ?? '') === '1';

    if (qty === null && !lotId && !isNew) continue;

    if (!lotId && isNew && materialId) {
      const { data: lot, error } = await supabase
        .from('ops_lots')
        .insert({
          material_id: materialId,
          origin: 'produced',
          state: 'in_process',
          cultivar: str(form.getAll('out_cultivar')[i]),
          created_by: staff.email,
        })
        .select('id')
        .single();
      if (error || !lot) {
        console.error('[atelier] output lot creation failed:', error);
        return redirect(`${back}?error=lot_create`, 303);
      }
      lotId = lot.id;
    }

    outRows.push({
      stage_id: stageId,
      lot_id: lotId,
      lot_ref: str(form.getAll('out_lot_ref')[i]),
      material_id: materialId,
      actual_qty_g: qty,
    });
  }
  if (outRows.length) {
    const { error } = await supabase.from('ops_stage_outputs').insert(outRows);
    if (error) { console.error('[atelier] outputs failed:', error); return redirect(`${back}?error=unknown`, 303); }
  }

  // ------------------------------------------------------------- losses
  await supabase.from('ops_stage_losses').delete().eq('stage_id', stageId);
  const lossQtys = form.getAll('loss_qty_g');
  const lossRows: any[] = [];
  for (let i = 0; i < lossQtys.length; i++) {
    const qty = num(lossQtys[i]);
    if (qty === null || qty === 0) continue;
    lossRows.push({
      stage_id: stageId,
      qty_g: qty,
      reason: String(form.getAll('loss_reason')[i] ?? 'process_waste'),
      note: str(form.getAll('loss_note')[i]),
    });
  }
  if (lossRows.length) {
    const { error } = await supabase.from('ops_stage_losses').insert(lossRows);
    if (error) { console.error('[atelier] losses failed:', error); return redirect(`${back}?error=unknown`, 303); }
  }

  // ---------------------------------------------------------- complete?
  if (!complete) {
    if (stage.status === 'planned') {
      await supabase.from('ops_wo_stages')
        .update({ status: 'in_progress', actual_start: str(form.get('actual_start')) ?? undefined })
        .eq('id', stageId);
    }
    return redirect(`${back}?ok=actuals_saved#stage-${stageId}`, 303);
  }

  const actualEnd = str(form.get('actual_end')) ?? new Date().toISOString().slice(0, 10);
  const { error: rpcErr } = await supabase.rpc('ops_complete_stage', {
    p_stage: stageId,
    p_actual_end: actualEnd,
  });

  if (rpcErr) {
    console.error('[atelier] complete stage failed:', rpcErr);
    const over = /cannot produce more/i.test(rpcErr.message ?? '');
    return redirect(`${back}?error=${over ? 'over_yield' : 'unknown'}`, 303);
  }

  // Move the work order along once every stage is finished.
  const { data: remaining } = await supabase
    .from('ops_wo_stages')
    .select('id')
    .eq('work_order_id', stage.work_order_id)
    .not('status', 'in', '("done","cancelled","skipped")');

  await supabase
    .from('ops_work_orders')
    .update({ status: (remaining ?? []).length === 0 ? 'done' : 'in_progress' })
    .eq('id', stage.work_order_id);

  return redirect(`${back}?ok=stage_completed`, 303);
};
