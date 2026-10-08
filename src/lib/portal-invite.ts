// Portal invitation: mints a Supabase invite link (new user) or a recovery
// link (existing login) and sends it in the branded email. Used by the
// admin "Send invitation" button and when a user is added.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPortalInvite } from './email';

export async function invitePortalUser(admin: SupabaseClient, staffId: string, actorEmail: string): Promise<boolean> {
  const { data: user } = await admin.from('staff').select('full_name, email, is_active').eq('id', staffId).maybeSingle();
  if (!user || !user.is_active) return false;

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
      } else console.error('[portal-invite] recovery failed:', recoveryRes.error);
    } else console.error('[portal-invite] invite failed:', inviteRes.error);
  } else {
    actionUrl = inviteRes.data?.properties?.action_link ?? null;
  }
  if (!actionUrl) return false;

  const result = await sendPortalInvite({ toEmail: user.email, toName: user.full_name, actionUrl, kind });
  await admin.from('audit_log').insert({
    submission_id: null, actor_email: actorEmail,
    action: kind === 'invite' ? 'portal_invite_sent' : 'portal_recovery_sent',
    metadata: { staff_id: staffId, by_admin: true, status: result.status },
  });
  return result.status === 'sent';
}
