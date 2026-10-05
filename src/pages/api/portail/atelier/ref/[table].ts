import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../lib/supabase';
import { currentOpsStaff, findRefTable, coerceField, missingRequired, canManage } from '../../../../../lib/ops';

export const prerender = false;

// Create / update / delete one row of an Atelier reference table.
//
// Writes go through the RLS-bound client on purpose: the ops_can_manage() policy
// in the database is the real gate. The role check below only produces a friendly
// message instead of an opaque policy rejection — it is not the security boundary.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const slug = String(params.table ?? '');
  const spec = findRefTable(slug);
  if (!spec) return new Response('Unknown table', { status: 404 });

  const base = `/portail/atelier/parametres/${slug}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);

  if (!canManage(staff.ops_role)) {
    return redirect(`${base}?error=denied`, 303);
  }

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const id = String(form.get('_id') ?? '').trim();

  // ---------------------------------------------------------------- delete
  if (action === 'delete') {
    if (!spec.allowDelete || !id) return redirect(`${base}?error=unknown`, 303);
    const { error } = await supabase.from(spec.table).delete().eq('id', id);
    if (error) {
      console.error(`[atelier] delete ${spec.table} failed:`, error);
      return redirect(`${base}?error=unknown`, 303);
    }
    return redirect(`${base}?ok=deleted`, 303);
  }

  if (action !== 'create' && action !== 'update') {
    return redirect(`${base}?error=unknown`, 303);
  }

  const missing = missingRequired(spec, form);
  if (missing.length > 0) {
    const back = action === 'update' ? `${base}?edit=${encodeURIComponent(id)}` : `${base}?new=1`;
    return redirect(`${back}&error=missing`, 303);
  }

  // Only columns declared in the spec are ever written.
  const payload: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const value = coerceField(field, form);
    if (value !== undefined) payload[field.key] = value;
  }

  if (action === 'create') {
    if (!spec.allowCreate) return redirect(`${base}?error=unknown`, 303);
    const { error } = await supabase.from(spec.table).insert(payload);
    if (error) {
      console.error(`[atelier] insert ${spec.table} failed:`, error);
      return redirect(`${base}?new=1&error=unknown`, 303);
    }
    return redirect(`${base}?ok=created`, 303);
  }

  if (!id) return redirect(`${base}?error=notfound`, 303);
  const { error, count } = await supabase
    .from(spec.table)
    .update(payload, { count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error(`[atelier] update ${spec.table} failed:`, error);
    return redirect(`${base}?edit=${encodeURIComponent(id)}&error=unknown`, 303);
  }
  if (count === 0) return redirect(`${base}?error=notfound`, 303);

  return redirect(`${base}?ok=updated`, 303);
};
