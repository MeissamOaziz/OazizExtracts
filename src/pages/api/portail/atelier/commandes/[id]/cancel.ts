import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';
import { EDITABLE_STATUSES } from '../../../../../../lib/ops-orders';

export const prerender = false;

// Cancel an order entered by mistake. The row stays — a cancelled order is still
// history, and its number must not be handed to something else.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const id = String(params.id ?? '');
  const detail = `/portail/atelier/commandes/${id}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${detail}?error=no_role`, 303);

  const { data: order } = await supabase
    .from('ops_orders').select('id, status').eq('id', id).maybeSingle();
  if (!order) return redirect('/portail/atelier/commandes?error=unknown', 303);
  if (!EDITABLE_STATUSES.includes(order.status)) {
    return redirect(`${detail}?error=locked`, 303);
  }

  const { error } = await supabase
    .from('ops_orders').update({ status: 'cancelled' }).eq('id', id);
  if (error) {
    console.error('[atelier] order cancel failed:', error);
    return redirect(`${detail}?error=unknown`, 303);
  }

  // Its work order should not sit in production's queue any more.
  await supabase
    .from('ops_work_orders')
    .update({ status: 'cancelled' })
    .eq('order_id', id)
    .neq('status', 'done');

  await supabase.from('ops_events').insert({
    order_id: id, actor_staff_id: staff.id, actor_email: staff.email,
    action: 'order_cancelled', detail: { from_status: order.status },
  });

  return redirect(`${detail}?ok=cancelled`, 303);
};
