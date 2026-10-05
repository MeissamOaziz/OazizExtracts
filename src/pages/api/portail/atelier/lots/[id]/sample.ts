import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Draw a lab sample from a batch or a released lot, or cancel one.
//
// ops_create_lab_sample() writes the sample row and the deduction together, so a
// sample can never exist without the material having left the lot.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const lotId = String(params.id ?? '');
  const back = `/portail/atelier/lots/${lotId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');

  if (action === 'cancel') {
    const sampleId = String(form.get('sample_id') ?? '').trim();
    if (!sampleId) return redirect(`${back}?error=unknown`, 303);

    const { error } = await supabase.rpc('ops_cancel_lab_sample', {
      p_sample: sampleId,
      p_reason: String(form.get('reason') ?? '').trim() || null,
    });
    if (error) {
      console.error('[atelier] cancel sample failed:', error);
      return redirect(`${back}?error=unknown`, 303);
    }
    return redirect(`${back}?ok=sampleCancelled`, 303);
  }

  const qtyRaw = String(form.get('qty_g') ?? '').trim().replace(',', '.');
  const qty = Number(qtyRaw);
  if (!qtyRaw || !Number.isFinite(qty) || qty <= 0) return redirect(`${back}?error=qty`, 303);

  const str = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v === '' ? null : v;
  };

  const { error } = await supabase.rpc('ops_create_lab_sample', {
    p_lot: lotId,
    p_qty_g: qty,
    p_purpose: str('purpose') ?? 'release_testing',
    p_lab_name: str('lab_name'),
    p_sent_at: str('sent_at'),
    p_expected_back: str('expected_back'),
    p_rnd_submission_id: str('rnd_submission_id'),
    p_notes: str('notes'),
  });

  if (error) {
    console.error('[atelier] create sample failed:', error);
    const tooMuch = /only .* on hand/i.test(error.message ?? '');
    return redirect(`${back}?error=${tooMuch ? 'tooMuch' : 'unknown'}`, 303);
  }

  return redirect(`${back}?ok=sampled`, 303);
};
