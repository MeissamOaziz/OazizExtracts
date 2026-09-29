import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { downloadCompanyLicenseBytes } from '../../../../lib/company-license-storage';
import { sendVendorInviteEmail } from '../../../../lib/email';

export const prerender = false;

// Staff-triggered: send a prospective vendor the public qualification form
// link, with Oaziz's own current CRA + Health Canada licenses attached.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/portail/fournisseurs?error=invite_email_invalid', 303);
  }

  const admin = getAdminClient();
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
      console.warn('[send-invite] could not attach license', lic.kind, e);
    }
  }

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const result = await sendVendorInviteEmail({
    toEmail: email,
    formUrl: `${siteUrl}/fournisseurs`,
    attachments,
  });

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'vendor_invite_sent',
    metadata: { to: email, email_status: result.status },
  });

  if (result.status === 'error') {
    return redirect('/portail/fournisseurs?error=invite_send_failed', 303);
  }
  return redirect('/portail/fournisseurs?info=invite_sent', 303);
};
