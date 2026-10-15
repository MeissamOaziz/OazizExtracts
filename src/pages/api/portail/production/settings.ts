import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { parseQty } from '../../../../lib/production';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOUR = /^#[0-9a-fA-F]{6}$/;

// Rooms and production types: add one, or save one row of the table.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const s = (k: string) => String(form.get(k) ?? '').trim();

  // Default products and yields per production type.
  if (action === 'add_yield' || action === 'save_yield') {
    const backY = (q: string) => redirect(`/portail/production/parametres?${q}#rendements`, 303);
    const admin = getAdminClient();
    if (action === 'save_yield' && form.get('remove') === '1') {
      const { error } = await admin.from('ps_type_outputs').delete().eq('id', s('id'));
      if (error) { console.error('[production] yield default remove failed:', error); return backY('error=unknown'); }
      return backY('ok=1');
    }
    const pct = parseQty(s('pct'));
    if (!s('product') || Number.isNaN(pct) || (pct !== null && pct > 100)) return backY('error=invalid');
    const row = { product: s('product'), is_byproduct: s('kind') === 'by', default_yield_pct: pct };
    let error;
    if (action === 'add_yield') {
      const typeId = s('production_type_id');
      if (!UUID.test(typeId)) return backY('error=invalid');
      const { count } = await admin.from('ps_type_outputs').select('id', { count: 'exact', head: true }).eq('production_type_id', typeId);
      ({ error } = await admin.from('ps_type_outputs').insert({ ...row, production_type_id: typeId, sort_order: (count ?? 0) + 1 }));
    } else {
      if (!UUID.test(s('id'))) return backY('error=invalid');
      ({ error } = await admin.from('ps_type_outputs').update(row).eq('id', s('id')));
    }
    if (error) { console.error('[production] yield default save failed:', error); return backY('error=unknown'); }
    return backY('ok=1');
  }

  const kind = action.endsWith('room') ? 'room' : 'type';
  const table = kind === 'room' ? 'ps_rooms' : 'ps_production_types';
  const back = (q: string) => redirect(`/portail/production/parametres?${q}#${kind === 'room' ? 'salles' : 'types'}`, 303);

  const row: Record<string, unknown> = {
    code: s('code').toUpperCase(),
    name_fr: s('name_fr'),
    name_en: s('name_en') || s('name_fr'),
    sort_order: Number.parseInt(s('sort_order'), 10) || 0,
    is_active: action.startsWith('add_') ? true : form.get('is_active') === '1',
  };
  if (kind === 'room') {
    row.colour = s('colour') || '#6b7280';
    row.allows_concurrent = form.get('allows_concurrent') === '1';
    if (!COLOUR.test(String(row.colour))) return back('error=invalid');
  }
  if (!row.code || !row.name_fr) return back('error=invalid');

  const admin = getAdminClient();
  let error;
  if (action === 'add_room' || action === 'add_type') {
    ({ error } = await admin.from(table).insert(row));
  } else if (action === 'save_room' || action === 'save_type') {
    const id = s('id');
    if (!UUID.test(id)) return back('error=invalid');
    ({ error } = await admin.from(table).update(row).eq('id', id));
  } else {
    return back('error=invalid');
  }
  if (error) {
    if (error.code === '23505') return back('error=duplicate');
    console.error('[production] settings save failed:', error);
    return back('error=unknown');
  }
  return back('ok=1');
};
