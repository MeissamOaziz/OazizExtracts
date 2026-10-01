import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { downloadCompanyLicenseBytes } from '../../../../lib/company-license-storage';
import { sendVendorInviteEmail, sendVendorDraftLink } from '../../../../lib/email';
import { mintToken } from '../../../../lib/tokens';

export const prerender = false;

// Re-pings a vendor who hasn't acted on their qualification invite yet, or
// who started a draft and left it unfinished. Re-mints a fresh token either
// way (invite or resume) rather than trying to recover the original raw
// token, which was never stored — only its hash.
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
    .select('id, email, vendor_submission_id')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite) return redirect('/portail/fournisseurs?error=unknown', 303);

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');

  let submission: { id: string; status: string; company_name: string | null } | null = null;
  if (invite.vendor_submission_id) {
    const { data } = await admin
      .from('vendor_submissions')
      .select('id, status, company_name')
      .eq('id', invite.vendor_submission_id)
      .maybeSingle();
    submission = data ?? null;
  }

  let result: { status: 'sent' | 'skipped_no_key' | 'error' };

  if (submission && submission.status === 'draft') {
    // In-progress draft — remint a resume token and send the resume link.
    const { raw, hash } = mintToken();
    await admin.from('vendor_submissions').update({ resume_token_hash: hash }).eq('id', submission.id);
    result = await sendVendorDraftLink({
      toEmail: invite.email,
      companyName: submission.company_name || invite.email,
      resumeUrl: `${siteUrl}/fournisseurs/brouillon/${raw}`,
    });
  } else if (!submission) {
    // Never started — remint an invite token (the original was never stored
    // in recoverable form) and resend the invite with our current licenses.
    const { raw, hash } = mintToken();
    await admin.from('vendor_invites').update({ invite_token_hash: hash }).eq('id', invite.id);

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

    result = await sendVendorInviteEmail({
      toEmail: invite.email,
      formUrl: `${siteUrl}/fournisseurs?invite=${raw}`,
      attachments,
    });
  } else {
    // Already submitted — nothing to remind the vendor about.
    return redirect('/portail/fournisseurs?error=unknown', 303);
  }

  await admin.from('vendor_invites').update({ last_reminder_sent_at: new Date().toISOString() }).eq('id', invite.id);

  // submission_id is a FK to the R&D `submissions` table, not vendor_submissions
  // — always null here, same as every other vendor-related audit_log entry.
  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'vendor_invite_reminder_sent',
    metadata: { invite_id: invite.id, vendor_submission_id: submission?.id ?? null, to: invite.email, email_status: result.status },
  });

  if (result.status === 'error') {
    return redirect('/portail/fournisseurs?error=invite_send_failed', 303);
  }
  return redirect('/portail/fournisseurs?info=reminder_sent', 303);
};
