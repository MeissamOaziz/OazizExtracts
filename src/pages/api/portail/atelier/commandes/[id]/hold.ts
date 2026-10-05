import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Place or lift a QA hold on one order.
//
// The hold is an overlay: the order keeps its own status throughout, so lifting
// resumes exactly where it was. RLS restricts ops_holds to qa + admin; the check
// below only turns a policy rejection into a readable message.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const orderId = String(params.id ?? '');
  const back = `/portail/atelier/commandes/${orderId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);

  if (staff.ops_role !== 'qa' && staff.ops_role !== 'admin') {
    return redirect(`${back}?error=hold_denied`, 303);
  }

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');

  if (action === 'hold') {
    const reason = String(form.get('reason') ?? '').trim();
    if (!reason) return redirect(`${back}?error=hold_reason`, 303);

    const { error } = await supabase.from('ops_holds').insert({
      entity_type: 'order',
      entity_id: orderId,
      reason,
      held_by_staff_id: staff.id,
    });
    if (error) {
      // The partial unique index rejects a second active hold on the same order.
      console.error('[atelier] hold insert failed:', error);
      return redirect(`${back}?error=${error.code === '23505' ? 'already_held' : 'unknown'}`, 303);
    }

    await supabase.from('ops_events').insert({
      order_id: orderId, actor_staff_id: staff.id, actor_email: staff.email,
      action: 'hold_placed', detail: { reason },
    });
    return redirect(`${back}?ok=held`, 303);
  }

  if (action === 'lift') {
    const note = String(form.get('lift_note') ?? '').trim() || null;
    const { data: active } = await supabase
      .from('ops_holds')
      .select('id')
      .eq('entity_type', 'order')
      .eq('entity_id', orderId)
      .is('lifted_at', null)
      .maybeSingle();

    if (!active) return redirect(`${back}?error=not_held`, 303);

    const { error } = await supabase
      .from('ops_holds')
      .update({ lifted_at: new Date().toISOString(), lifted_by_staff_id: staff.id, lift_note: note })
      .eq('id', active.id);

    if (error) {
      console.error('[atelier] hold lift failed:', error);
      return redirect(`${back}?error=unknown`, 303);
    }

    await supabase.from('ops_events').insert({
      order_id: orderId, actor_staff_id: staff.id, actor_email: staff.email,
      action: 'hold_lifted', detail: { note },
    });
    return redirect(`${back}?ok=lifted`, 303);
  }

  return redirect(`${back}?error=unknown`, 303);
};
