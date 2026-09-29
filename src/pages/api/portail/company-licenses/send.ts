import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { downloadCompanyLicenseBytes } from '../../../../lib/company-license-storage';
import { sendCompanyLicensesEmail } from '../../../../lib/email';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const form = await request.formData();
  const raw = String(form.get('recipients') ?? '').trim();
  const toEmails = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const allValid = toEmails.length > 0 && toEmails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (!allValid) {
    return redirect('/portail/fournisseurs/licences?error=send_email_invalid', 303);
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
      console.warn('[company-licenses/send] could not attach license', lic.kind, e);
    }
  }

  if (attachments.length === 0) {
    return redirect('/portail/fournisseurs/licences?error=no_files', 303);
  }

  const result = await sendCompanyLicensesEmail({ toEmails, attachments });

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'company_licenses_sent',
    metadata: { to: toEmails, email_status: result.status },
  });

  if (result.status === 'error') {
    return redirect('/portail/fournisseurs/licences?error=send_failed', 303);
  }
  return redirect('/portail/fournisseurs/licences?info=sent', 303);
};
