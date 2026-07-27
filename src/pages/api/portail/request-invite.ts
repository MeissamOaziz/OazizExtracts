import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { sendPortalInvite } from '../../../lib/email';

export const prerender = false;

// Called from the "Première connexion ou mot de passe oublié" panel on the login page.
// Uses admin.generateLink to mint a Supabase-verified action link WITHOUT triggering
// Supabase's default SMTP, then sends our own branded email via Resend.
// Always redirects with a generic success flash so the caller can't infer whether the
// address is on the roster.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    return redirect('/portail/connexion?error=missing', 303);
  }

  const admin = getAdminClient();

  const { data: staff } = await admin
    .from('staff')
    .select('full_name')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (!staff) {
    return redirect('/portail/connexion?info=invite_sent', 303);
  }

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const redirectTo = `${siteUrl}/portail`;

  // Try invite first (new user). If user exists → fall back to recovery.
  let actionUrl: string | null = null;
  let kind: 'invite' | 'recovery' = 'invite';

  const inviteRes = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  });

  if (inviteRes.error) {
    if (/already been registered|already registered|user with .* exists/i.test(inviteRes.error.message ?? '')) {
      const recoveryRes = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (recoveryRes.error) {
        console.error('[request-invite] recovery generateLink failed:', recoveryRes.error);
      } else {
        actionUrl = recoveryRes.data?.properties?.action_link ?? null;
        kind = 'recovery';
      }
    } else {
      console.error('[request-invite] invite generateLink failed:', inviteRes.error);
    }
  } else {
    actionUrl = inviteRes.data?.properties?.action_link ?? null;
    kind = 'invite';
  }

  if (actionUrl) {
    await sendPortalInvite({
      toEmail: email,
      toName: staff.full_name,
      actionUrl,
      kind,
    });
    await admin.from('audit_log').insert({
      submission_id: null,
      actor_email: email,
      action: kind === 'invite' ? 'portal_invite_sent' : 'portal_recovery_sent',
    });
  }

  return redirect('/portail/connexion?info=invite_sent', 303);
};
