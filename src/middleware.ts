import { defineMiddleware } from 'astro:middleware';
import { createServerClient, currentStaff, getAdminClient } from './lib/supabase';
import { effectivePermissions, can, matchRule, type AssignedKind } from './lib/access';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

async function isAssigned(kind: AssignedKind, path: string, staffId: string): Promise<boolean> {
  const admin = getAdminClient();
  if (kind === 'vendor_approver') {
    const id = new RegExp(`^/(?:api/)?portail/(?:fournisseurs|vendor-submissions)/(${UUID})(?:/|$)`, 'i').exec(path)?.[1];
    if (!id) return false;
    const { data } = await admin
      .from('vendor_submission_approvals').select('id')
      .eq('vendor_submission_id', id).eq('staff_id', staffId).maybeSingle();
    return !!data;
  }
  const id = new RegExp(`^/(?:api/)?portail/rh/(?:employes|employees)/(${UUID})(?:/|$)`, 'i').exec(path)?.[1];
  if (!id) return false;
  const { data } = await admin
    .from('hr_employee_packages').select('id')
    .eq('id', id).eq('witness_staff_id', staffId).maybeSingle();
  return !!data;
}

// Central module-access enforcement for every /portail and /api/portail
// request. Unauthenticated requests pass through untouched — each page/handler
// already redirects to the login — so this only decides what a *signed-in*
// user may open. Pages and the layout read the result from Astro.locals.access.
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (!path.startsWith('/portail') && !path.startsWith('/api/portail')) return next();

  const rule = matchRule(path);
  const supabase = createServerClient(context.request, context.cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return next();

  const perms = effectivePermissions(staff);
  context.locals.access = { staffId: staff.id, perms };

  if (!rule || can(perms, ...rule.any)) return next();
  if (rule.assigned && (await isAssigned(rule.assigned, path, staff.id))) return next();

  if (path.startsWith('/api/')) {
    return new Response('Forbidden', { status: 403 });
  }
  return context.redirect('/portail?error=forbidden', 303);
});
