import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { effectivePermissions, PERMISSIONS, type Permission } from '../../../../../../lib/access';
import { saveAccess } from '../../../../../../lib/staff-access';

export const prerender = false;

// The user's own page: name, title, active flag and ticked modules.
export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion');
  if (!effectivePermissions(staff).has('admin')) return new Response('Forbidden', { status: 403 });

  const { id } = params;
  if (!id) return redirect('/portail/admin/utilisateurs', 303);
  const back = `/portail/admin/utilisateurs/${id}`;

  const form = await request.formData();
  const fullName = String(form.get('full_name') ?? '').trim();
  const title = String(form.get('title') ?? '').trim() || null;
  if (!fullName) return redirect(`${back}?error=missing`, 303);

  const perms = new Set<Permission>(PERMISSIONS.filter((p) => form.get(`perm_${p}`) === 'on'));
  const r = await saveAccess(getAdminClient(), staff, id, {
    perms, is_active: form.get('is_active') === '1', full_name: fullName, title,
  });
  return redirect(r.ok ? `${back}?info=saved` : `${back}?error=${r.error}`, 303);
};
