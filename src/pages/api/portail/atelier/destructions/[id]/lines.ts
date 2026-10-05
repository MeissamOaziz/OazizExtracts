import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Add or remove a lot on a destruction that has not been carried out yet.
// The database refuses a write once the event is completed, because the record of
// what was destroyed must match what actually left stock.

export const POST: APIRoute = async ({ request, cookies, redirect, params }) => {
  const desId = String(params.id ?? '');
  const back = `/portail/atelier/destructions/${desId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const action = String(form.get('action') ?? '');

  const { data: des } = await supabase
    .from('ops_destructions').select('status').eq('id', desId).maybeSingle();
  if (!des) return redirect('/portail/atelier/destructions?error=unknown', 303);
  if (des.status !== 'planned') return redirect(`${back}?error=locked`, 303);

  if (action === 'remove') {
    const lineId = String(form.get('line_id') ?? '');
    const { error } = await supabase
      .from('ops_destruction_lines').delete().eq('id', lineId).eq('destruction_id', desId);
    if (error) {
      console.error('[atelier] destruction line delete failed:', error);
      return redirect(`${back}?error=unknown`, 303);
    }
    return redirect(`${back}?ok=removed`, 303);
  }

  const lotId = String(form.get('lot_id') ?? '').trim();
  const qtyRaw = String(form.get('qty_g') ?? '').trim().replace(',', '.');
  const qty = Number(qtyRaw);
  const unitsRaw = String(form.get('units') ?? '').trim();
  if (!lotId || !Number.isFinite(qty) || qty <= 0) return redirect(`${back}?error=lot`, 303);

  const { error } = await supabase.from('ops_destruction_lines').insert({
    destruction_id: desId,
    lot_id: lotId,
    qty_g: qty,
    units: unitsRaw === '' ? null : Math.round(Number(unitsRaw)),
  });

  if (error) {
    console.error('[atelier] destruction line insert failed:', error);
    // The same lot twice on one event is a mistake, not two destructions.
    if (error.code === '23505') return redirect(`${back}?error=lot`, 303);
    return redirect(`${back}?error=unknown`, 303);
  }

  return redirect(`${back}?ok=line`, 303);
};
