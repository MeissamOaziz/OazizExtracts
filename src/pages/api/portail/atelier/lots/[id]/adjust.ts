import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Correct a lot's quantity. ops_adjust_lot writes a reversing ledger entry rather
// than editing anything, so the original figure and the correction both survive.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const lotId = String(params.id ?? '');
  const back = `/portail/atelier/lots/${lotId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const raw = String(form.get('delta_g') ?? '').trim().replace(',', '.');
  const delta = Number(raw);
  const reason = String(form.get('reason') ?? '').trim();

  if (!raw || !Number.isFinite(delta) || delta === 0) return redirect(`${back}?error=qty`, 303);
  if (!reason) return redirect(`${back}?error=reason`, 303);

  const { error } = await supabase.rpc('ops_adjust_lot', {
    p_lot: lotId,
    p_delta_g: delta,
    p_reason: reason,
  });

  if (error) {
    console.error('[atelier] lot adjust failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }
  return redirect(`${back}?ok=adjusted`, 303);
};
