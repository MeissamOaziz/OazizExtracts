import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Close a packaging run: material leaves the source lot, the packaged lot is
// created, and the label is frozen — all inside ops_complete_packaging_run().
//
// Every label rule is refused by the database rather than by this route, so the
// only job here is to pass the numbers through and turn the refusal into something
// readable. The messages are matched on rather than parsed for structure, so a
// rule we do not recognise still surfaces its own text.

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

export const POST: APIRoute = async ({ request, cookies, redirect, params }) => {
  const runId = String(params.id ?? '');
  const back = `/portail/atelier/emballage/${runId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const units = num(form, 'units_produced');
  const consumed = num(form, 'consumed_g');

  if (units === null || units <= 0) return redirect(`${back}?error=units`, 303);
  if (consumed === null || consumed <= 0) return redirect(`${back}?error=qty`, 303);

  const { error } = await supabase.rpc('ops_complete_packaging_run', {
    p_run: runId,
    p_units_produced: Math.round(units),
    p_consumed_g: consumed,
    p_packaged_on: str(form, 'packaged_on') ?? new Date().toISOString().slice(0, 10),
    p_is_excised: form.get('is_excised') !== null,
    p_excise_province: str(form, 'excise_province'),
    p_thc_pct: num(form, 'thc_pct'),
    p_cbd_pct: num(form, 'cbd_pct'),
    p_cultivar: str(form, 'cultivar'),
  });

  if (error) {
    console.error('[atelier] complete packaging run failed:', error);
    // The database writes these messages for a person to read, so show them.
    const msg = (error.message ?? '').replace(/^.*?:\s*/, '').trim();
    return redirect(`${back}?error=rule&msg=${encodeURIComponent(msg)}`, 303);
  }

  return redirect(`${back}?ok=completed`, 303);
};
