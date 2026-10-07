// Saving a user's ticked modules from the admin panel (grid toggle or the
// user's own page). Always writes explicit grants and clears the legacy role.

import type { SupabaseClient } from '@supabase/supabase-js';
import { grantedPermissions, PERMISSIONS, type Permission, type PermissionGrants } from './access';

export type SaveAccessError = 'self_admin' | 'last_admin' | 'self_deactivate' | 'not_found' | 'unknown';

export async function saveAccess(
  admin: SupabaseClient,
  actor: { id: string; email: string },
  targetId: string,
  next: { perms: Set<Permission>; is_active?: boolean; full_name?: string; title?: string | null },
): Promise<{ ok: true; perms: Permission[] } | { ok: false; error: SaveAccessError }> {
  const { data: user } = await admin.from('staff')
    .select('id, email, is_active, portal_role, portal_permission_overrides').eq('id', targetId).maybeSingle();
  if (!user) return { ok: false, error: 'not_found' };

  const isSelf = user.id === actor.id;
  const active = next.is_active ?? user.is_active;
  if (isSelf && !active) return { ok: false, error: 'self_deactivate' };
  if (isSelf && !next.perms.has('admin')) return { ok: false, error: 'self_admin' };

  // Never leave the portal without an active admin.
  if (!(next.perms.has('admin') && active)) {
    const { data: others } = await admin.from('staff')
      .select('email, portal_role, portal_permission_overrides').eq('is_active', true).neq('id', targetId);
    if (!(others ?? []).some((o) => grantedPermissions(o).has('admin'))) return { ok: false, error: 'last_admin' };
  }

  const before = [...grantedPermissions(user)];
  const grants: PermissionGrants = {};
  for (const p of PERMISSIONS) if (next.perms.has(p)) grants[p] = true;

  const { error } = await admin.from('staff').update({
    portal_role: null, portal_permission_overrides: grants, is_active: active,
    ...(next.full_name !== undefined ? { full_name: next.full_name } : {}),
    ...(next.title !== undefined ? { title: next.title } : {}),
  }).eq('id', targetId);
  if (error) {
    console.error('[admin/access] save failed:', error);
    return { ok: false, error: 'unknown' };
  }
  await admin.from('audit_log').insert({
    submission_id: null, actor_email: actor.email, action: 'portal_access_updated',
    metadata: { staff_id: targetId, before, after: Object.keys(grants), is_active: active },
  });
  return { ok: true, perms: Object.keys(grants) as Permission[] };
}
