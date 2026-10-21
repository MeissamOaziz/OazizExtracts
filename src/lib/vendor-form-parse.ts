// The vendor form as posted, shared by the vendor's own submit
// (/api/vendor/submit) and by Oaziz staff filling a file in for a vendor
// (/api/portail/vendor-submissions/[id]/staff-edit), so both read every field
// the same way.

import type { getAdminClient } from './supabase';
import { validateUploadedFile, uploadVendorFile } from './vendor-storage';
import { REQUIRED_APPROVER_EMAILS } from './vendor-approvals';
import { sendVendorSubmissionNotice } from './email';

type Admin = ReturnType<typeof getAdminClient>;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Every column the vendor form sets, read from the posted form. */
export function readVendorFields(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const getOrNull = (k: string) => get(k) || null;

  const vendor_type = getOrNull('vendor_type');
  const isCannabisGrower = vendor_type === 'cannabis_grower';
  const shipping_same_as_billing = form.get('shipping_same_as_billing') === '1';

  return {
    vendor_type,
    company_name: get('company_name'),
    address: get('address'),
    city: get('city'),
    province: get('province'),
    postal_code: get('postal_code'),
    contact_person: get('contact_person'),
    phone: get('phone'),
    phone_ext: getOrNull('phone_ext'),
    email: get('email'),

    shipping_same_as_billing,
    shipping_address: shipping_same_as_billing ? null : getOrNull('shipping_address'),
    shipping_city: shipping_same_as_billing ? null : getOrNull('shipping_city'),
    shipping_province: shipping_same_as_billing ? null : getOrNull('shipping_province'),
    shipping_postal_code: shipping_same_as_billing ? null : getOrNull('shipping_postal_code'),

    sales_contact_name: get('sales_contact_name'),
    sales_contact_email: get('sales_contact_email'),
    sales_contact_phone: getOrNull('sales_contact_phone'),
    sales_contact_phone_ext: getOrNull('sales_contact_phone_ext'),
    qa_contact_name: get('qa_contact_name'),
    qa_contact_email: get('qa_contact_email'),
    qa_contact_phone: getOrNull('qa_contact_phone'),
    qa_contact_phone_ext: getOrNull('qa_contact_phone_ext'),
    accounting_contact_name: getOrNull('accounting_contact_name'),
    accounting_contact_email: getOrNull('accounting_contact_email'),
    accounting_contact_phone: getOrNull('accounting_contact_phone'),
    accounting_contact_phone_ext: getOrNull('accounting_contact_phone_ext'),

    business_number: getOrNull('business_number'),
    gst_hst_number: getOrNull('gst_hst_number'),
    qst_number: getOrNull('qst_number'),

    bank_institution_number: getOrNull('bank_institution_number'),
    bank_transit_number: getOrNull('bank_transit_number'),
    bank_account_number: getOrNull('bank_account_number'),
    bank_address: getOrNull('bank_address'),

    // Universal — applies to every vendor type.
    products_sold: getOrNull('products_sold'),

    // Culture-information fields only apply to cannabis growers — forced to
    // null for any other vendor type regardless of what was posted, since the
    // section is hidden (and thus untouched) in the UI for everyone else.
    production_type: isCannabisGrower ? getOrNull('production_type') : null,
    cultivation_methods: isCannabisGrower ? form.getAll('cultivation_methods').map(String).filter(Boolean) : [],
    lighting_type: isCannabisGrower ? getOrNull('lighting_type') : null,
    medium_type: isCannabisGrower ? getOrNull('medium_type') : null,
    nutrient_type: isCannabisGrower ? getOrNull('nutrient_type') : null,
    cultivar_name: isCannabisGrower ? getOrNull('cultivar_name') : null,
    starting_material: isCannabisGrower ? form.getAll('starting_material').map(String).filter(Boolean) : [],
    pesticides_used: isCannabisGrower ? getOrNull('pesticides_used') : null,

    certified: form.get('certified') === '1',
    certified_by_name: get('certified_by_name'),
    certified_by_title: get('certified_by_title'),

    file_cra_license_expiry: DATE_RE.test(get('file_cra_license_expiry')) ? get('file_cra_license_expiry') : null,
    file_health_canada_license_expiry: DATE_RE.test(get('file_health_canada_license_expiry')) ? get('file_health_canada_license_expiry') : null,
  };
}
export type VendorFields = ReturnType<typeof readVendorFields>;

/**
 * A license whose expiry date changed (renewed) gets a fresh reminder cycle:
 * its reminder flag is cleared on the update.
 */
export function reminderResets(fields: VendorFields, existing: Record<string, any>): Record<string, null> {
  const out: Record<string, null> = {};
  if (fields.file_cra_license_expiry && fields.file_cra_license_expiry !== existing.file_cra_license_expiry) {
    out.file_cra_license_reminder_sent_at = null;
  }
  if (fields.file_health_canada_license_expiry && fields.file_health_canada_license_expiry !== existing.file_health_canada_license_expiry) {
    out.file_health_canada_license_reminder_sent_at = null;
  }
  return out;
}

const FILE_JOBS: Array<{ field: string; kind: 'cra-license' | 'health-canada-license' | 'bank-proof'; column: string }> = [
  { field: 'file_cra_license', kind: 'cra-license', column: 'file_cra_license_path' },
  { field: 'file_health_canada_license', kind: 'health-canada-license', column: 'file_health_canada_license_path' },
  { field: 'file_bank_proof', kind: 'bank-proof', column: 'file_bank_void_cheque_path' },
];

/** First uploaded file that is not acceptable, as an error code, or null. */
export function invalidUpload(form: FormData): 'file_type' | 'file_size' | null {
  for (const job of FILE_JOBS) {
    const file = form.get(job.field) as File | null;
    if (!file || file.size === 0) continue;
    const err = validateUploadedFile(file);
    if (err === 'too_large') return 'file_size';
    if (err) return 'file_type';
  }
  return null;
}

/** Stores the files that were provided (replacing earlier ones); returns the columns set. */
export async function uploadAnyProvidedFiles(admin: Admin, submissionId: string, form: FormData): Promise<string[]> {
  const updates: Record<string, string> = {};
  for (const job of FILE_JOBS) {
    const file = form.get(job.field) as File | null;
    if (!file || file.size === 0) continue;
    if (validateUploadedFile(file)) continue; // invalid files are rejected earlier for the required-file cases; silently skip here for optional re-uploads on draft saves
    updates[job.column] = await uploadVendorFile(submissionId, job.kind, file);
  }
  if (Object.keys(updates).length > 0) {
    await admin.from('vendor_submissions').update(updates).eq('id', submissionId);
  }
  return Object.keys(updates);
}

/** A submitted file goes to every required approver: fresh approval rows, one email each. */
export async function sendForApproval(admin: Admin, submissionId: string, companyName: string): Promise<boolean> {
  const { data: approverStaff } = await admin
    .from('staff')
    .select('id, full_name, email')
    .in('email', [...REQUIRED_APPROVER_EMAILS]);
  if (!approverStaff || approverStaff.length === 0) {
    console.error('[vendor-submit] no approver staff rows found for', REQUIRED_APPROVER_EMAILS);
    return false;
  }
  // Idempotent-ish: a draft resumed twice could already have approval rows
  // from an earlier partial run — clear any stale rows first.
  await admin.from('vendor_submission_approvals').delete().eq('vendor_submission_id', submissionId);
  await admin.from('vendor_submission_approvals').insert(
    approverStaff.map((s) => ({ vendor_submission_id: submissionId, staff_id: s.id })),
  );
  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const submissionUrl = `${siteUrl}/portail/fournisseurs/${submissionId}`;
  for (const approver of approverStaff) {
    await sendVendorSubmissionNotice({ toEmail: approver.email, toName: approver.full_name, companyName, submissionUrl });
  }
  return true;
}
