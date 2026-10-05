import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';

export const prerender = false;

// Open a packaging run.
//
// Creating one writes nothing to the ledger — it is a plan. Everything that moves
// material happens in ops_complete_packaging_run(), which is also where the label
// rules are enforced.

function str(form: FormData, k: string): string | null {
  const v = String(form.get(k) ?? '').trim();
  return v === '' ? null : v;
}
function num(form: FormData, k: string): number | null {
  const v = str(form, k);
  if (v === null) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const back = '/portail/atelier/emballage/nouveau';

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier/emballage?error=no_role', 303);

  const form = await request.formData();
  const productId = str(form, 'product_id');
  const sourceLotId = str(form, 'source_lot_id');
  if (!productId || !sourceLotId) return redirect(`${back}?error=missing`, 303);

  // The SKU's own size is the sensible default for the unit size.
  let unitSize = num(form, 'unit_size_g');
  if (unitSize === null) {
    const { data: product } = await supabase
      .from('ops_products').select('sku_size_g').eq('id', productId).maybeSingle();
    unitSize = product?.sku_size_g ?? null;
  }

  const { data, error } = await supabase
    .from('ops_packaging_runs')
    .insert({
      product_id: productId,
      source_lot_id: sourceLotId,
      order_id: str(form, 'order_id'),
      units_planned: num(form, 'units_planned'),
      unit_size_g: unitSize,
      packaged_on: str(form, 'packaged_on') ?? new Date().toISOString().slice(0, 10),
      is_excised: form.get('is_excised') !== null,
      excise_province: str(form, 'excise_province'),
      notes: str(form, 'notes'),
      created_by: staff.email,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[atelier] packaging run insert failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }

  return redirect(`/portail/atelier/emballage/${data.id}?ok=created`, 303);
};
