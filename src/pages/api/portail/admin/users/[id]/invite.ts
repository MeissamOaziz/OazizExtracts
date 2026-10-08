import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { effectivePermissions } from '../../../../../../lib/access';
import { invitePortalUser } from '../../../../../../lib/portal-invite';

export const prerender = false;

// Admin-triggered version of the login page's "first sign-in / forgot
// password" flow (invite link for a new user, recovery link otherwise).
export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion');
  if (!effectivePermissions(staff).has('admin')) return new Response('Forbidden', { status: 403 });
  const { id } = params;
  if (!id) return redirect('/portail/admin/utilisateurs', 303);
  const back = `/portail/admin/utilisateurs/${id}`;
  const ok = await invitePortalUser(getAdminClient(), id, staff.email);
  return redirect(ok ? `${back}?info=invited` : `${back}?error=invite_failed`, 303);
};
