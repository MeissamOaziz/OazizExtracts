import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { effectivePermissions, isRole, PERMISSIONS, type PermissionOverrides } from '../../../../../../lib/access';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');
  if (!effectivePermissions(staff).has('admin')) return new Response('Forbidden', { status: 403 });

  const { id } = params;
  if (!id) return redirect('/portail/admin/utilisateurs', 303);
  const back = `/portail/admin/utilisateurs/${id}`;

  const form = await request.formData();
  const fullName = String(form.get('full_name') ?? '').trim();
  const title = String(form.get('title') ?? '').trim() || null;
  const roleRaw = String(form.get('portal_role') ?? '');
  const role = isRole(roleRaw) ? roleRaw : null;
  const isActive = form.get('is_active') === '1';
  if (!fullName) return redirect(`${back}?error=missing`, 303);

  const overrides: PermissionOverrides = {};
  if (role && role !== 'admin') {
    for (const p of PERMISSIONS) {
      const v = form.get(`perm_${p}`);
      if (v === 'grant') overrides[p] = true;
      else if (v === 'deny') overrides[p] = false;
    }
  }

  if (id === staff.id && !isActive) return redirect(`${back}?error=self_deactivate`, 303);

  // Never allow the portal to end up with no active admin.
  const admin = getAdminClient();
  const stillAdmin = role === 'admin' && isActive;
  if (!stillAdmin) {
    const { count } = await admin
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('portal_role', 'admin')
      .eq('is_active', true)
      .neq('id', id);
    if (!count) return redirect(`${back}?error=last_admin`, 303);
  }

  const { error } = await admin
    .from('staff')
    .update({
      full_name: fullName, title, portal_role: role,
      portal_permission_overrides: overrides, is_active: isActive,
    })
    .eq('id', id);
  if (error) {
    console.error('[admin/users/update] failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'portal_access_updated',
    metadata: { staff_id: id, portal_role: role, overrides, is_active: isActive },
  });

  return redirect(`${back}?info=saved`, 303);
};
