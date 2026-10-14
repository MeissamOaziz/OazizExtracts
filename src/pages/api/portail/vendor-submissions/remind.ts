import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { downloadCompanyLicenseBytes } from '../../../../lib/company-license-storage';
import { sendVendorInviteEmail } from '../../../../lib/email';
import { mintToken } from '../../../../lib/tokens';
import { inviteRecipients } from '../../../../lib/vendor-invites';

export const prerender = false;

// Re-pings everyone on an invite that has not been submitted yet — whether
// nobody has opened it or someone started the form and left it unfinished. The
// invite link opens the group's shared draft when there is one, so the same
// email covers both cases.
//
// Only a hash of the original link was ever stored, so a fresh link is minted.
// It is ADDED to the invite rather than replacing the old one: with several
// recipients, replacing it would break the link in everyone's earlier email.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const form = await request.formData();
  const inviteId = String(form.get('invite_id') ?? '').trim();
  if (!inviteId) return redirect('/portail/fournisseurs?error=unknown', 303);

  const admin = getAdminClient();
  const { data: invite } = await admin
    .from('vendor_invites')
    .select('id, email, recipients, extra_token_hashes, vendor_submission_id')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite) return redirect('/portail/fournisseurs?error=unknown', 303);

  if (invite.vendor_submission_id) {
    const { data: sub } = await admin
      .from('vendor_submissions')
      .select('status')
      .eq('id', invite.vendor_submission_id)
      .maybeSingle();
    // Already submitted: nothing left to remind anyone about.
    if (sub?.status === 'submitted') return redirect('/portail/fournisseurs?error=unknown', 303);
  }

  const { raw, hash } = mintToken();
  await admin
    .from('vendor_invites')
    .update({ extra_token_hashes: [...(invite.extra_token_hashes ?? []), hash] })
    .eq('id', invite.id);

  const { data: licenses } = await admin
    .from('company_licenses')
    .select('kind, file_path')
    .in('kind', ['cra', 'health_canada']);
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  for (const lic of licenses ?? []) {
    if (!lic.file_path) continue;
    try {
      const bytes = await downloadCompanyLicenseBytes(lic.file_path);
      attachments.push({
        filename: lic.kind === 'cra' ? 'Oaziz-Licence-CRA.pdf' : 'Oaziz-Licence-Sante-Canada.pdf',
        content: bytes,
      });
    } catch (e) {
      console.warn('[vendor-remind] could not attach license', lic.kind, e);
    }
  }

  const to = inviteRecipients(invite);
  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const result = await sendVendorInviteEmail({
    toEmails: to,
    formUrl: `${siteUrl}/fournisseurs?invite=${raw}`,
    attachments,
  });

  await admin.from('vendor_invites').update({ last_reminder_sent_at: new Date().toISOString() }).eq('id', invite.id);

  // submission_id is a FK to the R&D `submissions` table, not vendor_submissions
  // — always null here, same as every other vendor-related audit_log entry.
  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'vendor_invite_reminder_sent',
    metadata: { invite_id: invite.id, vendor_submission_id: invite.vendor_submission_id, to, email_status: result.status },
  });

  if (result.status === 'error') {
    return redirect('/portail/fournisseurs?error=invite_send_failed', 303);
  }
  return redirect('/portail/fournisseurs?info=reminder_sent', 303);
};
