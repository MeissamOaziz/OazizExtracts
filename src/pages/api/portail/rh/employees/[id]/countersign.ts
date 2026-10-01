import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { downloadHrBytes, uploadHrBytes } from '../../../../../../lib/hr-storage';
import { overlayCodeOfConductSignatures } from '../../../../../../lib/hr-pdf';
import { sendEmployeePackageCompleted } from '../../../../../../lib/email';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return Response.json({ error: 'not_authenticated' }, { status: 401 });

  const { id } = params;
  if (!id) return Response.json({ error: 'no_id' }, { status: 400 });

  let payload: { signature?: string; save_signature?: boolean };
  try { payload = await request.json(); }
  catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }

  const signature = String(payload.signature ?? '');
  if (!signature.startsWith('data:image/png') || signature.length < 500 || signature.length > 500_000) {
    return Response.json({ error: 'signature_invalid' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: pkg } = await admin
    .from('hr_employee_packages')
    .select(`
      id, status, language, new_employee_name, new_employee_email, witness_staff_id,
      info_pdf_path, info_first_name, info_last_name,
      coc_employee_signature, coc_employee_signed_at
    `)
    .eq('id', id)
    .maybeSingle();

  if (!pkg) return Response.json({ error: 'not_found' }, { status: 404 });
  if (pkg.status !== 'awaiting_witness') return Response.json({ error: 'wrong_status' }, { status: 400 });
  if (pkg.witness_staff_id !== staff.id) return Response.json({ error: 'not_witness' }, { status: 403 });

  const signedAt = new Date().toISOString();

  const { data: cocRef } = await admin
    .from('company_hr_documents')
    .select('file_path')
    .eq('kind', `code_of_conduct_${pkg.language}`)
    .maybeSingle();
  if (!cocRef?.file_path) {
    console.error('[countersign] no code_of_conduct file configured for language', pkg.language);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  let finalCocBytes: Uint8Array;
  try {
    const baseBytes = await downloadHrBytes(cocRef.file_path);
    finalCocBytes = await overlayCodeOfConductSignatures(
      baseBytes,
      {
        employeeName: `${pkg.info_first_name ?? ''} ${pkg.info_last_name ?? ''}`.trim() || pkg.new_employee_name,
        employeeSignature: pkg.coc_employee_signature,
        employeeDate: pkg.coc_employee_signed_at,
        witnessSignature: signature,
        witnessDate: signedAt,
      },
      pkg.language as 'en' | 'fr',
    );
  } catch (e) {
    console.error('[countersign] overlay failed:', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  const cocPdfPath = `employee-packages/${pkg.id}/code-of-conduct-signed.pdf`;
  try {
    await uploadHrBytes(cocPdfPath, finalCocBytes);
  } catch (e) {
    console.error('[countersign] upload failed:', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  if (payload.save_signature === true) {
    await admin.from('staff').update({ saved_signature: signature }).eq('id', staff.id);
  }

  const { error: updErr } = await admin
    .from('hr_employee_packages')
    .update({
      status: 'completed',
      coc_witness_signature: signature,
      coc_witness_signed_at: signedAt,
      coc_pdf_path: cocPdfPath,
    })
    .eq('id', pkg.id);
  if (updErr) {
    console.error('[countersign] update failed:', updErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'hr_employee_package_countersigned',
    metadata: { package_id: pkg.id },
  });

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  if (pkg.info_pdf_path) {
    try { attachments.push({ filename: 'Formulaire-Informations-Employe.pdf', content: await downloadHrBytes(pkg.info_pdf_path) }); }
    catch (e) { console.warn('[countersign] could not attach info pdf', e); }
  }
  attachments.push({ filename: 'Code-de-Conduite-Signe.pdf', content: Buffer.from(finalCocBytes) });

  await sendEmployeePackageCompleted({
    toEmails: ['jorge@oaziz.ca', 'meissam@oaziz.ca', 'stephane@oaziz.ca', pkg.new_employee_email],
    employeeName: pkg.new_employee_name,
    portalUrl: `${siteUrl}/portail/rh/employes/${pkg.id}`,
    attachments,
  });

  return Response.json({ ok: true });
};
