import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';
import { chainDates, lastActiveEnd } from '../../../../../lib/ops-stages';

export const prerender = false;

// Add a stage to a work order.
//
// Dates arrive from the form (the planner pre-fills them), but if they are blank
// the same chaining rule is applied server-side, so an API caller and the UI
// agree. Room and yield default from the process catalogue and stay overridable.

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier?error=no_role', 303);

  const form = await request.formData();
  const woId = String(form.get('work_order_id') ?? '').trim();
  const processTypeId = String(form.get('process_type_id') ?? '').trim();
  const back = `/portail/atelier/production/${woId}`;

  if (!woId || !processTypeId) return redirect(`${back}?error=missing`, 303);

  const [{ data: pt }, { data: stages }] = await Promise.all([
    supabase.from('ops_process_types')
      .select('id, room_id, default_duration_days, default_yield_pct')
      .eq('id', processTypeId).maybeSingle(),
    supabase.from('ops_wo_stages')
      .select('seq, status, planned_end, actual_end')
      .eq('work_order_id', woId),
  ]);

  if (!pt) return redirect(`${back}?error=unknown`, 303);

  const existing = stages ?? [];
  const nextSeq = existing.reduce((m, s: any) => Math.max(m, s.seq), 0) + 1;

  const chained = chainDates(lastActiveEnd(existing as any), pt.default_duration_days);
  const start = String(form.get('planned_start') ?? '').trim() || chained.start;
  const end = String(form.get('planned_end') ?? '').trim() || chained.end;

  if (end < start) return redirect(`${back}?error=dates`, 303);

  const roomId = String(form.get('room_id') ?? '').trim() || pt.room_id;
  const assignee = String(form.get('assignee_staff_id') ?? '').trim() || null;
  const yieldRaw = String(form.get('expected_yield_pct') ?? '').trim();

  const { data: created, error } = await supabase
    .from('ops_wo_stages')
    .insert({
      work_order_id: woId,
      seq: nextSeq,
      process_type_id: processTypeId,
      room_id: roomId || null,
      planned_start: start,
      planned_end: end,
      assignee_staff_id: assignee,
      expected_yield_pct: yieldRaw === '' ? pt.default_yield_pct : Number(yieldRaw.replace(',', '.')),
      notes: String(form.get('notes') ?? '').trim() || null,
    })
    .select('id')
    .single();

  if (error || !created) {
    console.error('[atelier] stage insert failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }

  // Chain it to the previous stage unless asked not to — the common case is a
  // sequence, and an unlinked stage is one click away.
  if (form.get('link_previous') !== null && nextSeq > 1) {
    const { data: prev } = await supabase
      .from('ops_wo_stages')
      .select('id')
      .eq('work_order_id', woId)
      .eq('seq', nextSeq - 1)
      .maybeSingle();
    if (prev) {
      const { error: depErr } = await supabase
        .from('ops_stage_deps')
        .insert({ stage_id: created.id, depends_on_stage_id: prev.id });
      if (depErr) console.error('[atelier] auto dep failed:', depErr);
    }
  }

  // The work order leaves "awaiting plan" as soon as it has a stage.
  await supabase
    .from('ops_work_orders')
    .update({ status: 'planned' })
    .eq('id', woId)
    .eq('status', 'awaiting_plan');

  return redirect(`${back}?ok=stage_added`, 303);
};
