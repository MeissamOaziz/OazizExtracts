import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Approve, carry out, or cancel a destruction.
//
// Every rule — QA only, two witnesses, the attestation, not more than is on hand —
// lives in the database functions, so this route passes the form through and turns
// a refusal into something readable. The messages are written for the person
// standing at the destruction, so they are shown as-is rather than remapped.

function str(form: FormData, k: string): string | null {
  const v = String(form.get(k) ?? '').trim();
  return v === '' ? null : v;
}

export const POST: APIRoute = async ({ request, cookies, redirect, params }) => {
  const desId = String(params.id ?? '');
  const back = `/portail/atelier/destructions/${desId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const action = String(form.get('action') ?? '');

  let error: { message?: string } | null = null;
  let ok = 'approved';

  if (action === 'approve') {
    ({ error } = await supabase.rpc('ops_approve_destruction', { p_destruction: desId }));
  } else if (action === 'complete') {
    ok = 'completed';
    ({ error } = await supabase.rpc('ops_complete_destruction', {
      p_destruction: desId,
      p_destroyed_on: str(form, 'destroyed_on') ?? new Date().toISOString().slice(0, 10),
      p_witness_1_name: str(form, 'witness_1_name'),
      p_witness_2_name: str(form, 'witness_2_name'),
      p_attestation: str(form, 'attestation'),
    }));
  } else if (action === 'cancel') {
    ok = 'cancelled';
    const reason = str(form, 'reason');
    if (!reason) return redirect(`${back}?error=reason`, 303);
    ({ error } = await supabase.rpc('ops_cancel_destruction', {
      p_destruction: desId,
      p_reason: reason,
    }));
  } else {
    return redirect(`${back}?error=unknown`, 303);
  }

  if (error) {
    console.error(`[atelier] destruction ${action} failed:`, error);
    const msg = (error.message ?? '').replace(/^.*?:\s*/, '').trim();
    return redirect(`${back}?error=rule&msg=${encodeURIComponent(msg)}`, 303);
  }

  if (action === 'cancel') return redirect(`/portail/atelier/destructions?ok=cancelled`, 303);
  return redirect(`${back}?ok=${ok}`, 303);
};
