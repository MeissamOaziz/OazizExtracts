import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { mintToken } from '../../../../../lib/tokens';
import { downloadHrBytes } from '../../../../../lib/hr-storage';
import { sendEmployeePackageInvite } from '../../../../../lib/email';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const form = await request.formData();
  const name = String(form.get('new_employee_name') ?? '').trim();
  const email = String(form.get('new_employee_email') ?? '').trim();
  const language = form.get('language') === 'en' ? 'en' : 'fr';

  if (!name || !email) {
    return redirect('/portail/rh/employes?error=missing', 303);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/portail/rh/employes?error=invalid_email', 303);
  }

  const admin = getAdminClient();
  const { raw, hash } = mintToken();

  const { data: inserted, error: insErr } = await admin
    .from('hr_employee_packages')
    .insert({
      status: 'sent',
      language,
      new_employee_name: name,
      new_employee_email: email,
      sent_by_staff_id: staff.id,
      access_token_hash: hash,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error('[rh/employees/send] insert failed:', insErr);
    return redirect('/portail/rh/employes?error=unknown', 303);
  }

  const { data: refDocs } = await admin
    .from('company_hr_documents')
    .select('kind, file_path')
    .in('kind', [`td1_${language}`, `tp1015_${language}`]);

  const attachments: Array<{ filename: string; content: Buffer }> = [];
  for (const doc of refDocs ?? []) {
    if (!doc.file_path) continue;
    try {
      const bytes = await downloadHrBytes(doc.file_path);
      const filename = doc.kind.startsWith('td1') ? 'TD1.pdf' : 'TP-1015.3.pdf';
      attachments.push({ filename, content: bytes });
    } catch (e) {
      console.warn('[rh/employees/send] could not attach', doc.kind, e);
    }
  }

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const packageUrl = `${siteUrl}/rh/bienvenue/${raw}`;

  const result = await sendEmployeePackageInvite({
    toEmail: email,
    employeeName: name,
    language,
    packageUrl,
    attachments,
  });

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'hr_employee_package_sent',
    metadata: { package_id: inserted.id, to: email, email_status: result.status },
  });

  if (result.status === 'error') {
    return redirect('/portail/rh/employes?error=send_failed', 303);
  }
  return redirect('/portail/rh/employes?info=sent', 303);
};
