import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { validateUploadedFile, uploadVendorFile } from '../../../lib/vendor-storage';
import { REQUIRED_APPROVER_EMAILS } from '../../../lib/vendor-approvals';
import { sendVendorSubmissionNotice, sendVendorDraftLink } from '../../../lib/email';
import { mintToken, sha256Hex } from '../../../lib/tokens';

export const prerender = false;

function backTo(submissionId: string | null, resumeToken: string | null, errorCode: string): string {
  const base = submissionId && resumeToken ? `/fournisseurs/brouillon/${resumeToken}` : '/fournisseurs';
  return `${base}?error=${errorCode}`;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const getOrNull = (k: string) => get(k) || null;

  const action = get('action') === 'draft' ? 'draft' : 'submit';
  const existingSubmissionId = getOrNull('submission_id');
  const resumeToken = getOrNull('resume_token');
  const inviteToken = getOrNull('invite_token');

  const admin = getAdminClient();

  // If resuming, verify the (submission_id, resume_token) pair before touching anything.
  let existing: Record<string, any> | null = null;
  if (existingSubmissionId && resumeToken) {
    const { data } = await admin
      .from('vendor_submissions')
      .select('*')
      .eq('id', existingSubmissionId)
      .eq('resume_token_hash', sha256Hex(resumeToken))
      .eq('status', 'draft')
      .maybeSingle();
    if (!data) return redirect('/fournisseurs?error=unknown', 303);
    existing = data;
  }

  const vendor_type = getOrNull('vendor_type');
  const isCannabisGrower = vendor_type === 'cannabis_grower';

  const company_name = get('company_name');
  const address = get('address');
  const city = get('city');
  const province = get('province');
  const postal_code = get('postal_code');
  const contact_person = get('contact_person');
  const phone = get('phone');
  const phone_ext = getOrNull('phone_ext');
  const email = get('email');

  const shipping_same_as_billing = form.get('shipping_same_as_billing') === '1';
  const shipping_address = shipping_same_as_billing ? null : getOrNull('shipping_address');
  const shipping_city = shipping_same_as_billing ? null : getOrNull('shipping_city');
  const shipping_province = shipping_same_as_billing ? null : getOrNull('shipping_province');
  const shipping_postal_code = shipping_same_as_billing ? null : getOrNull('shipping_postal_code');

  const sales_contact_name = get('sales_contact_name');
  const sales_contact_email = get('sales_contact_email');
  const sales_contact_phone = getOrNull('sales_contact_phone');
  const sales_contact_phone_ext = getOrNull('sales_contact_phone_ext');
  const qa_contact_name = get('qa_contact_name');
  const qa_contact_email = get('qa_contact_email');
  const qa_contact_phone = getOrNull('qa_contact_phone');
  const qa_contact_phone_ext = getOrNull('qa_contact_phone_ext');
  const accounting_contact_name = getOrNull('accounting_contact_name');
  const accounting_contact_email = getOrNull('accounting_contact_email');
  const accounting_contact_phone = getOrNull('accounting_contact_phone');
  const accounting_contact_phone_ext = getOrNull('accounting_contact_phone_ext');

  const business_number = getOrNull('business_number');
  const gst_hst_number = getOrNull('gst_hst_number');
  const qst_number = getOrNull('qst_number');

  const bank_institution_number = getOrNull('bank_institution_number');
  const bank_transit_number = getOrNull('bank_transit_number');
  const bank_account_number = getOrNull('bank_account_number');
  const bank_address = getOrNull('bank_address');

  // Culture-information fields only apply to cannabis growers — force them to
  // null for any other vendor type regardless of what was posted, since the
  // section is hidden (and thus untouched) in the UI for everyone else.
  const production_type = isCannabisGrower ? getOrNull('production_type') : null;
  const cultivation_methods = isCannabisGrower ? form.getAll('cultivation_methods').map(String).filter(Boolean) : [];
  const lighting_type = isCannabisGrower ? getOrNull('lighting_type') : null;
  const medium_type = isCannabisGrower ? getOrNull('medium_type') : null;
  const nutrient_type = isCannabisGrower ? getOrNull('nutrient_type') : null;
  const cultivar_name = isCannabisGrower ? getOrNull('cultivar_name') : null;
  const starting_material = isCannabisGrower ? form.getAll('starting_material').map(String).filter(Boolean) : [];
  const pesticides_used = isCannabisGrower ? getOrNull('pesticides_used') : null;

  // Universal — applies to every vendor type.
  const products_sold = getOrNull('products_sold');

  const certified = form.get('certified') === '1';
  const certified_by_name = get('certified_by_name');
  const certified_by_title = get('certified_by_title');

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const file_cra_license_expiry = DATE_RE.test(get('file_cra_license_expiry')) ? get('file_cra_license_expiry') : null;
  const file_health_canada_license_expiry = DATE_RE.test(get('file_health_canada_license_expiry')) ? get('file_health_canada_license_expiry') : null;

  const fields = {
    vendor_type,
    company_name, address, city, province, postal_code, contact_person, phone, phone_ext, email,
    shipping_same_as_billing, shipping_address, shipping_city, shipping_province, shipping_postal_code,
    sales_contact_name, sales_contact_email, sales_contact_phone, sales_contact_phone_ext,
    qa_contact_name, qa_contact_email, qa_contact_phone, qa_contact_phone_ext,
    accounting_contact_name, accounting_contact_email, accounting_contact_phone, accounting_contact_phone_ext,
    business_number, gst_hst_number, qst_number,
    bank_institution_number, bank_transit_number, bank_account_number, bank_address,
    products_sold,
    production_type, cultivation_methods, lighting_type, medium_type, nutrient_type,
    cultivar_name, starting_material, pesticides_used,
    certified, certified_by_name, certified_by_title,
    file_cra_license_expiry, file_health_canada_license_expiry,
  };

  // If a license's expiry date actually changed (vendor renewed and told us
  // the new date), reset that license's reminder flag so a new cycle can
  // fire for it. New rows start with the flag unset (column default null).
  if (existing) {
    if (file_cra_license_expiry && file_cra_license_expiry !== existing.file_cra_license_expiry) {
      (fields as Record<string, unknown>).file_cra_license_reminder_sent_at = null;
    }
    if (file_health_canada_license_expiry && file_health_canada_license_expiry !== existing.file_health_canada_license_expiry) {
      (fields as Record<string, unknown>).file_health_canada_license_reminder_sent_at = null;
    }
  }

  // ---------------- DRAFT SAVE ----------------
  // Minimal validation: just enough to identify who to send the resume link to.
  if (action === 'draft') {
    if (!company_name || !email) {
      return redirect(backTo(existingSubmissionId, resumeToken, 'missing_draft'), 303);
    }

    if (existing) {
      await admin.from('vendor_submissions').update(fields).eq('id', existing.id);
      // Files are optional to re-upload on a draft save; only replace what was provided.
      await uploadAnyProvidedFiles(admin, existing.id, form);
      return redirect(`/fournisseurs/brouillon/${resumeToken}?info=draft_saved`, 303);
    }

    const { raw, hash } = mintToken();
    const { data: inserted, error: insErr } = await admin
      .from('vendor_submissions')
      .insert({ ...fields, status: 'draft', resume_token_hash: hash })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('[vendor-submit] draft insert failed:', insErr);
      return redirect('/fournisseurs?error=unknown', 303);
    }
    await uploadAnyProvidedFiles(admin, inserted.id, form);
    await linkInviteIfAny(admin, inviteToken, inserted.id, fields);

    const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
    const resumeUrl = `${siteUrl}/fournisseurs/brouillon/${raw}`;
    await sendVendorDraftLink({ toEmail: email, companyName: company_name || email, resumeUrl });

    return redirect(`${resumeUrl.replace(siteUrl, '')}?info=draft_saved`, 303);
  }

  // ---------------- FULL SUBMIT ----------------
  if (
    !vendor_type ||
    !company_name || !address || !city || !province || !postal_code || !contact_person || !phone || !email ||
    !sales_contact_name || !sales_contact_email ||
    !qa_contact_name || !qa_contact_email ||
    !accounting_contact_email ||
    !business_number || !gst_hst_number ||
    !bank_institution_number || !bank_transit_number || !bank_account_number || !bank_address ||
    !certified_by_name || !certified_by_title ||
    !file_cra_license_expiry || !file_health_canada_license_expiry
  ) {
    return redirect(backTo(existingSubmissionId, resumeToken, 'missing'), 303);
  }
  if (!certified) {
    return redirect(backTo(existingSubmissionId, resumeToken, 'certify'), 303);
  }
  const anyContactPhone = !!(sales_contact_phone || qa_contact_phone || accounting_contact_phone);
  if (!anyContactPhone) {
    return redirect(backTo(existingSubmissionId, resumeToken, 'phone_required'), 303);
  }
  if (!shipping_same_as_billing && (!shipping_address || !shipping_city || !shipping_province || !shipping_postal_code)) {
    return redirect(backTo(existingSubmissionId, resumeToken, 'shipping_missing'), 303);
  }

  const fileBankProof = form.get('file_bank_proof') as File | null;
  const fileCra = form.get('file_cra_license') as File | null;
  const fileHc = form.get('file_health_canada_license') as File | null;

  const hasExistingFile = (col: string) => !!(existing && existing[col]);

  if (!hasExistingFile('file_bank_void_cheque_path') || (fileBankProof && fileBankProof.size > 0)) {
    const err = validateUploadedFile(fileBankProof);
    if (err === 'missing' && !hasExistingFile('file_bank_void_cheque_path')) {
      return redirect(backTo(existingSubmissionId, resumeToken, 'file_bank'), 303);
    }
    if (err && err !== 'missing') {
      return redirect(backTo(existingSubmissionId, resumeToken, err === 'too_large' ? 'file_size' : 'file_type'), 303);
    }
  }
  if (!hasExistingFile('file_cra_license_path') || (fileCra && fileCra.size > 0)) {
    const err = validateUploadedFile(fileCra);
    if (err === 'missing' && !hasExistingFile('file_cra_license_path')) {
      return redirect(backTo(existingSubmissionId, resumeToken, 'file_cra'), 303);
    }
    if (err && err !== 'missing') {
      return redirect(backTo(existingSubmissionId, resumeToken, err === 'too_large' ? 'file_size' : 'file_type'), 303);
    }
  }
  if (!hasExistingFile('file_health_canada_license_path') || (fileHc && fileHc.size > 0)) {
    const err = validateUploadedFile(fileHc);
    if (err === 'missing' && !hasExistingFile('file_health_canada_license_path')) {
      return redirect(backTo(existingSubmissionId, resumeToken, 'file_hc'), 303);
    }
    if (err && err !== 'missing') {
      return redirect(backTo(existingSubmissionId, resumeToken, err === 'too_large' ? 'file_size' : 'file_type'), 303);
    }
  }

  let submissionId: string;
  if (existing) {
    submissionId = existing.id;
    const { error: updErr } = await admin
      .from('vendor_submissions')
      .update({ ...fields, status: 'submitted', submitted_at: new Date().toISOString(), resume_token_hash: null })
      .eq('id', submissionId);
    if (updErr) {
      console.error('[vendor-submit] finalize update failed:', updErr);
      return redirect(backTo(existingSubmissionId, resumeToken, 'unknown'), 303);
    }
  } else {
    // A second click on Submit while the first request is still uploading files
    // arrives as a brand-new submission, which is how PBG BioPharma ended up with
    // two identical rows four seconds apart (2026-10-02). If the same vendor email
    // already submitted the same company in the last ten minutes, that earlier
    // submission is the one: acknowledge it rather than create a twin.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: twin } = await admin
      .from('vendor_submissions')
      .select('id')
      .eq('status', 'submitted')
      .ilike('email', likeLiteral(email))
      .ilike('company_name', likeLiteral(company_name))
      .gte('submitted_at', tenMinutesAgo)
      .limit(1)
      .maybeSingle();
    if (twin) {
      await linkInviteIfAny(admin, inviteToken, twin.id, fields);
      return redirect('/fournisseurs/merci', 303);
    }

    const { data: inserted, error: insErr } = await admin
      .from('vendor_submissions')
      .insert({ ...fields, status: 'submitted', submitted_at: new Date().toISOString() })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('[vendor-submit] insert failed:', insErr);
      return redirect('/fournisseurs?error=unknown', 303);
    }
    submissionId = inserted.id as string;
    await linkInviteIfAny(admin, inviteToken, submissionId, fields);
  }

  try {
    await uploadAnyProvidedFiles(admin, submissionId, form);
  } catch (e) {
    console.error('[vendor-submit] file upload failed:', e);
    return redirect(backTo(existingSubmissionId, resumeToken, 'unknown'), 303);
  }

  const { data: approverStaff } = await admin
    .from('staff')
    .select('id, full_name, email')
    .in('email', [...REQUIRED_APPROVER_EMAILS]);

  if (approverStaff && approverStaff.length > 0) {
    // Idempotent-ish: a draft resumed twice could already have approval rows
    // from an earlier partial run — clear any stale rows first.
    await admin.from('vendor_submission_approvals').delete().eq('vendor_submission_id', submissionId);
    await admin.from('vendor_submission_approvals').insert(
      approverStaff.map((s) => ({ vendor_submission_id: submissionId, staff_id: s.id })),
    );

    const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
    const submissionUrl = `${siteUrl}/portail/fournisseurs/${submissionId}`;
    for (const approver of approverStaff) {
      await sendVendorSubmissionNotice({
        toEmail: approver.email,
        toName: approver.full_name,
        companyName: company_name,
        submissionUrl,
      });
    }
  } else {
    console.error('[vendor-submit] no approver staff rows found for', REQUIRED_APPROVER_EMAILS);
  }

  return redirect('/fournisseurs/merci', 303);
};

// ilike is used for its case-insensitivity only; its wildcards must not apply,
// and underscores are common in email addresses.
function likeLiteral(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Free mailboxes say nothing about which company someone works for, so they
// never count as a domain match.
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.ca',
  'icloud.com', 'me.com', 'msn.com', 'aol.com', 'videotron.ca', 'bell.net', 'sympatico.ca',
]);

// Best-effort: links this submission back to the invite that brought the vendor
// here, so staff can see on the dashboard that the invite was acted on instead
// of it sitting as "not started" forever.
//
// The token is the reliable route, but invites get forwarded: PBG's went to
// their QA lead and was filled in by their sales lead from a link without the
// token, so it stayed "not started" despite two submissions. Without a token,
// an open invite is matched by exact email against any address on the
// submission, then by company domain.
async function linkInviteIfAny(
  admin: ReturnType<typeof getAdminClient>,
  inviteToken: string | null,
  submissionId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  if (inviteToken) {
    await admin
      .from('vendor_invites')
      .update({ vendor_submission_id: submissionId })
      .eq('invite_token_hash', sha256Hex(inviteToken))
      .is('vendor_submission_id', null);
    return;
  }

  const addresses = ['email', 'sales_contact_email', 'qa_contact_email', 'accounting_contact_email']
    .map((k) => String(fields[k] ?? '').trim().toLowerCase())
    .filter((e) => e.includes('@'));
  if (addresses.length === 0) return;

  const { data: open } = await admin
    .from('vendor_invites')
    .select('id, email')
    .is('vendor_submission_id', null)
    .order('sent_at', { ascending: false });
  if (!open || open.length === 0) return;

  const domainOf = (e: string) => e.split('@')[1] ?? '';
  const domains = new Set(addresses.map(domainOf).filter((d) => d && !FREE_MAIL_DOMAINS.has(d)));

  const match =
    open.find((i) => addresses.includes(i.email.trim().toLowerCase())) ??
    open.find((i) => domains.has(domainOf(i.email.trim().toLowerCase())));
  if (!match) return;

  await admin
    .from('vendor_invites')
    .update({ vendor_submission_id: submissionId })
    .eq('id', match.id)
    .is('vendor_submission_id', null);
}

async function uploadAnyProvidedFiles(
  admin: ReturnType<typeof getAdminClient>,
  submissionId: string,
  form: FormData,
): Promise<void> {
  const jobs: Array<{ field: string; kind: 'cra-license' | 'health-canada-license' | 'bank-proof'; column: string }> = [
    { field: 'file_cra_license', kind: 'cra-license', column: 'file_cra_license_path' },
    { field: 'file_health_canada_license', kind: 'health-canada-license', column: 'file_health_canada_license_path' },
    { field: 'file_bank_proof', kind: 'bank-proof', column: 'file_bank_void_cheque_path' },
  ];
  const updates: Record<string, string> = {};
  for (const job of jobs) {
    const file = form.get(job.field) as File | null;
    if (!file || file.size === 0) continue;
    if (validateUploadedFile(file)) continue; // invalid files are rejected earlier for the required-file cases; silently skip here for optional re-uploads on draft saves
    const path = await uploadVendorFile(submissionId, job.kind, file);
    updates[job.column] = path;
  }
  if (Object.keys(updates).length > 0) {
    await admin.from('vendor_submissions').update(updates).eq('id', submissionId);
  }
}
