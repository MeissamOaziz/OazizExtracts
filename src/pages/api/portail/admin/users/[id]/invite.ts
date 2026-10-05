import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { effectivePermissions } from '../../../../../../lib/access';
import { sendPortalInvite } from '../../../../../../lib/email';

export const prerender = false;

// Admin-triggered version of the login page's "first sign-in / forgot
// password" flow: mints a Supabase invite (new user) or recovery (existing
// user) link and sends it in our branded email.
export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');
  if (!effectivePermissions(staff).has('admin')) return new Response('Forbidden', { status: 403 });

  const { id } = params;
  if (!id) return redirect('/portail/admin/utilisateurs', 303);
  const back = `/portail/admin/utilisateurs/${id}`;

  const admin = getAdminClient();
  const { data: user } = await admin
    .from('staff').select('full_name, email, is_active').eq('id', id).maybeSingle();
  if (!user || !user.is_active) return redirect(`${back}?error=invite_failed`, 303);

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const redirectTo = `${siteUrl}/portail`;

  let actionUrl: string | null = null;
  let kind: 'invite' | 'recovery' = 'invite';

  const inviteRes = await admin.auth.admin.generateLink({ type: 'invite', email: user.email, options: { redirectTo } });
  if (inviteRes.error) {
    if (/already been registered|already registered|user with .* exists/i.test(inviteRes.error.message ?? '')) {
      const recoveryRes = await admin.auth.admin.generateLink({ type: 'recovery', email: user.email, options: { redirectTo } });
      if (!recoveryRes.error) {
        actionUrl = recoveryRes.data?.properties?.action_link ?? null;
        kind = 'recovery';
      } else {
        console.error('[admin/users/invite] recovery failed:', recoveryRes.error);
      }
    } else {
      console.error('[admin/users/invite] invite failed:', inviteRes.error);
    }
  } else {
    actionUrl = inviteRes.data?.properties?.action_link ?? null;
  }

  if (!actionUrl) return redirect(`${back}?error=invite_failed`, 303);

  const result = await sendPortalInvite({ toEmail: user.email, toName: user.full_name, actionUrl, kind });
  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: kind === 'invite' ? 'portal_invite_sent' : 'portal_recovery_sent',
    metadata: { staff_id: id, by_admin: true },
  });

  if (result.status === 'error') return redirect(`${back}?error=invite_failed`, 303);
  return redirect(`${back}?info=invited`, 303);
};
