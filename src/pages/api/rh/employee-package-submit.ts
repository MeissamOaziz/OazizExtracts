import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { sha256Hex } from '../../../lib/tokens';
import { uploadHrBytes } from '../../../lib/hr-storage';
import { buildEmployeeInfoPdf } from '../../../lib/hr-pdf';
import { sendWitnessCountersignRequest } from '../../../lib/email';

export const prerender = false;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, unknown>;
  try { payload = await request.json(); }
  catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }

  const token = String(payload.token ?? '');
  if (!token) return Response.json({ error: 'invalid_token' }, { status: 400 });

  const str = (k: string, max = 300) => String(payload[k] ?? '').trim().slice(0, max);
  const firstName = str('first_name'), lastName = str('last_name'), address = str('address'),
    phone = str('phone'), dob = str('dob'), sin = str('sin'), email = str('email'),
    emergencyFirstName = str('emergency_first_name'), emergencyLastName = str('emergency_last_name'),
    emergencyPhone = str('emergency_phone'), startDate = str('start_date');
  const signature = String(payload.signature ?? '');

  if (!firstName || !lastName || !address || !phone || !dob || !sin || !email
    || !emergencyFirstName || !emergencyLastName || !emergencyPhone || !startDate) {
    return Response.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!DATE_RE.test(dob) || !DATE_RE.test(startDate)) {
    return Response.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (!signature.startsWith('data:image/png') || signature.length < 500 || signature.length > 500_000) {
    return Response.json({ error: 'signature_invalid' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: pkg } = await admin
    .from('hr_employee_packages')
    .select('id, language, new_employee_email')
    .eq('access_token_hash', sha256Hex(token))
    .eq('status', 'sent')
    .maybeSingle();
  if (!pkg) return Response.json({ error: 'expired_or_submitted' }, { status: 404 });

  const signedAt = new Date().toISOString();
  const pdfBytes = await buildEmployeeInfoPdf({
    firstName, lastName, address, phone, dob, sin, email,
    emergencyFirstName, emergencyLastName, emergencyPhone, startDate,
    signatureDataUrl: signature, signedDate: signedAt,
  });

  const infoPdfPath = `employee-packages/${pkg.id}/employee-info.pdf`;
  try {
    await uploadHrBytes(infoPdfPath, pdfBytes);
  } catch (e) {
    console.error('[employee-package-submit] upload failed:', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  const { data: witness } = await admin
    .from('staff')
    .select('id, full_name, email')
    .eq('email', 'jorge@oaziz.ca')
    .maybeSingle();

  const { error: updErr } = await admin
    .from('hr_employee_packages')
    .update({
      status: 'awaiting_witness',
      info_first_name: firstName, info_last_name: lastName, info_address: address,
      info_phone: phone, info_dob: dob, info_sin: sin, info_email: email,
      info_emergency_first_name: emergencyFirstName, info_emergency_last_name: emergencyLastName,
      info_emergency_phone: emergencyPhone, info_start_date: startDate,
      info_signature: signature, info_signed_at: signedAt,
      coc_employee_signature: signature, coc_employee_signed_at: signedAt,
      info_pdf_path: infoPdfPath,
      witness_staff_id: witness?.id ?? null,
    })
    .eq('id', pkg.id);
  if (updErr) {
    console.error('[employee-package-submit] update failed:', updErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: email,
    action: 'hr_employee_package_signed',
    metadata: { package_id: pkg.id },
  });

  if (witness) {
    const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
    await sendWitnessCountersignRequest({
      toEmail: witness.email,
      toName: witness.full_name,
      employeeName: `${firstName} ${lastName}`,
      portalUrl: `${siteUrl}/portail/rh/employes/${pkg.id}`,
    });
  } else {
    console.warn('[employee-package-submit] no staff row found for jorge@oaziz.ca — witness not notified');
  }

  return Response.json({ ok: true });
};
