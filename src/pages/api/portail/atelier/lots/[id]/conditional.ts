import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Conditional release: ship in quarantine while lab results are outstanding,
// with the customer's agreement on record. Revoking it is the recall trigger.
//
// Every precondition (QA role, documented reason, customer agreement, a sample
// actually at the lab) is enforced in the database function; this route only
// turns each refusal into a message the user can act on.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const lotId = String(params.id ?? '');
  const back = `/portail/atelier/lots/${lotId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);

  const form = await request.formData();
  const action = String(form.get('_action') ?? 'grant');

  if (action === 'revoke') {
    const reason = String(form.get('reason') ?? '').trim();
    if (!reason) return redirect(`${back}?error=reason`, 303);

    const { error } = await supabase.rpc('ops_revoke_conditional_release', {
      p_lot: lotId,
      p_reason: reason,
    });
    if (error) {
      console.error('[atelier] revoke conditional failed:', error);
      const notQa = /Only QA/i.test(error.message ?? '');
      return redirect(`${back}?error=${notQa ? 'notQa' : 'unknown'}`, 303);
    }
    return redirect(`${back}?ok=condRevoked`, 303);
  }

  const reason = String(form.get('reason') ?? '').trim();
  const ack = form.get('customer_ack') !== null;

  const { error } = await supabase.rpc('ops_conditional_release_lot', {
    p_lot: lotId,
    p_reason: reason || null,
    p_customer_ack: ack,
    p_notes: String(form.get('notes') ?? '').trim() || null,
  });

  if (error) {
    console.error('[atelier] conditional release failed:', error);
    const msg = error.message ?? '';
    const code = /Only QA/i.test(msg) ? 'notQa'
      : /Send a sample/i.test(msg) ? 'needSample'
      : /customer must have agreed/i.test(msg) ? 'needAck'
      : /documented reason/i.test(msg) ? 'reason'
      : /already/i.test(msg) ? 'alreadyReleased'
      : 'unknown';
    return redirect(`${back}?error=${code}`, 303);
  }

  return redirect(`${back}?ok=condGranted`, 303);
};
