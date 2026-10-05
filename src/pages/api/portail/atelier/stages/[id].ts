import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';

export const prerender = false;

// Edit one stage: dates, room, assignee, yield, status, dependencies — or remove
// it. Dates stay editable at every status, because the plan moves as production
// moves; that was the explicit requirement.

function s(form: FormData, k: string): string | null {
  const v = String(form.get(k) ?? '').trim();
  return v === '' ? null : v;
}

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const stageId = String(params.id ?? '');

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier?error=no_role', 303);

  const { data: stage } = await supabase
    .from('ops_wo_stages')
    .select('id, work_order_id, seq')
    .eq('id', stageId)
    .maybeSingle();

  if (!stage) return redirect('/portail/atelier?error=unknown', 303);
  const back = `/portail/atelier/production/${stage.work_order_id}`;

  const form = await request.formData();
  const action = String(form.get('_action') ?? 'update');

  // ------------------------------------------------------------- delete
  if (action === 'delete') {
    const { error } = await supabase.from('ops_wo_stages').delete().eq('id', stageId);
    if (error) {
      console.error('[atelier] stage delete failed:', error);
      return redirect(`${back}?error=unknown`, 303);
    }
    return redirect(`${back}?ok=stage_removed`, 303);
  }

  // --------------------------------------------------------- dependency
  if (action === 'add_dep' || action === 'remove_dep') {
    const other = s(form, 'depends_on_stage_id');
    if (!other) return redirect(`${back}?error=unknown`, 303);

    if (action === 'remove_dep') {
      await supabase.from('ops_stage_deps')
        .delete().eq('stage_id', stageId).eq('depends_on_stage_id', other);
      return redirect(`${back}?ok=dep_removed`, 303);
    }

    const { error } = await supabase
      .from('ops_stage_deps')
      .insert({ stage_id: stageId, depends_on_stage_id: other });
    if (error) {
      // The cycle trigger and the self-reference constraint both land here.
      console.error('[atelier] dep insert failed:', error);
      const cyclic = /cycle/i.test(error.message ?? '');
      return redirect(`${back}?error=${cyclic ? 'cycle' : 'unknown'}`, 303);
    }
    return redirect(`${back}?ok=dep_added`, 303);
  }

  // ------------------------------------------------- re-chain from here
  // Deliberately an explicit action, never automatic: a date Simon set by hand
  // must not be rewritten behind his back when an earlier stage moves.
  if (action === 'rechain') {
    const { data: all } = await supabase
      .from('ops_wo_stages')
      .select('id, seq, status, planned_start, planned_end, process_type_id, process:ops_process_types ( default_duration_days )')
      .eq('work_order_id', stage.work_order_id)
      .order('seq');

    let cursor: string | null = null;
    for (const st of (all ?? []) as any[]) {
      if (st.seq < stage.seq) {
        if (st.status !== 'cancelled' && st.status !== 'skipped' && st.planned_end) {
          if (!cursor || st.planned_end > cursor) cursor = st.planned_end;
        }
        continue;
      }
      if (st.status === 'cancelled' || st.status === 'skipped' || st.status === 'done') continue;

      const span = Math.max(1, Math.ceil(Number(st.process?.default_duration_days ?? 1)));
      const start = cursor ? addDaysIso(cursor, 1) : (st.planned_start ?? new Date().toISOString().slice(0, 10));
      const end = addDaysIso(start, span - 1);
      await supabase.from('ops_wo_stages')
        .update({ planned_start: start, planned_end: end }).eq('id', st.id);
      cursor = end;
    }
    return redirect(`${back}?ok=rechained`, 303);
  }

  // ------------------------------------------------------------- update
  const start = s(form, 'planned_start');
  const end = s(form, 'planned_end');
  if (start && end && end < start) return redirect(`${back}?error=dates`, 303);

  const yieldRaw = s(form, 'expected_yield_pct');

  const { error } = await supabase
    .from('ops_wo_stages')
    .update({
      planned_start: start,
      planned_end: end,
      actual_start: s(form, 'actual_start'),
      actual_end: s(form, 'actual_end'),
      room_id: s(form, 'room_id'),
      assignee_staff_id: s(form, 'assignee_staff_id'),
      status: s(form, 'status') ?? 'planned',
      expected_yield_pct: yieldRaw === null ? null : Number(yieldRaw.replace(',', '.')),
      label: s(form, 'label'),
      notes: s(form, 'notes'),
    })
    .eq('id', stageId);

  if (error) {
    console.error('[atelier] stage update failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }
  return redirect(`${back}?ok=stage_saved`, 303);
};

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
