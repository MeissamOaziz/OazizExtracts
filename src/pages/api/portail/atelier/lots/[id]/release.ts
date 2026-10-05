import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// QA turns a batch into a released, sellable lot — or withdraws that release.
//
// Both the role check and the COA requirement live in ops_release_lot(); this
// route only translates the database's refusal into a readable message.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const lotId = String(params.id ?? '');
  const back = `/portail/atelier/lots/${lotId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);

  const form = await request.formData();
  const action = String(form.get('_action') ?? 'release');

  if (action === 'withdraw') {
    const reason = String(form.get('reason') ?? '').trim();
    if (!reason) return redirect(`${back}?error=reason`, 303);

    const { error } = await supabase.rpc('ops_unrelease_lot', { p_lot: lotId, p_reason: reason });
    if (error) {
      console.error('[atelier] unrelease failed:', error);
      const notQa = /Only QA/i.test(error.message ?? '');
      return redirect(`${back}?error=${notQa ? 'notQa' : 'unknown'}`, 303);
    }
    return redirect(`${back}?ok=withdrawn`, 303);
  }

  const coaRaw = String(form.get('coa_ref') ?? '').trim();
  const qtyRaw = String(form.get('final_qty_g') ?? '').trim().replace(',', '.');
  const finalQty = qtyRaw === '' ? null : Number(qtyRaw);

  const { error } = await supabase.rpc('ops_release_lot', {
    p_lot: lotId,
    p_coa_ref: coaRaw === '' ? null : coaRaw,
    p_final_qty_g: finalQty !== null && Number.isFinite(finalQty) ? finalQty : null,
    p_notes: String(form.get('notes') ?? '').trim() || null,
  });

  if (error) {
    console.error('[atelier] release failed:', error);
    const msg = error.message ?? '';
    const code = /Only QA/i.test(msg) ? 'notQa'
      : /COA is required/i.test(msg) ? 'coa'
      : /already released/i.test(msg) ? 'alreadyReleased'
      : 'unknown';
    return redirect(`${back}?error=${code}`, 303);
  }

  return redirect(`${back}?ok=released`, 303);
};
