import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { effectivePermissions, grantedPermissions, PERMISSIONS, type Permission } from '../../../../../../lib/access';
import { saveAccess } from '../../../../../../lib/staff-access';

export const prerender = false;

// One checkbox of the Users & Access grid: { perm, granted } → saved at once.
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  if (!effectivePermissions(staff).has('admin')) return json({ error: 'forbidden' }, 403);

  const body = await request.json().catch(() => null) as { perm?: string; granted?: boolean } | null;
  const perm = body?.perm as Permission;
  if (!params.id || !PERMISSIONS.includes(perm) || typeof body?.granted !== 'boolean') return json({ error: 'invalid' }, 400);

  const admin = getAdminClient();
  const { data: user } = await admin.from('staff')
    .select('email, portal_role, portal_permission_overrides').eq('id', params.id).maybeSingle();
  if (!user) return json({ error: 'not_found' }, 404);
  const perms = grantedPermissions(user);
  if (body.granted) perms.add(perm); else perms.delete(perm);

  const r = await saveAccess(admin, staff, params.id, { perms });
  return r.ok ? json({ ok: true, perms: r.perms }) : json({ error: r.error }, 409);
};
