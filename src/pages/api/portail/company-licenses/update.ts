import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { uploadCompanyLicenseFile } from '../../../../lib/company-license-storage';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const form = await request.formData();
  const kind = String(form.get('kind') ?? '').trim();
  if (kind !== 'cra' && kind !== 'health_canada') {
    return redirect('/portail/fournisseurs/licences?error=unknown', 303);
  }

  const expiryDateRaw = String(form.get('expiry_date') ?? '').trim();
  const expiry_date = /^\d{4}-\d{2}-\d{2}$/.test(expiryDateRaw) ? expiryDateRaw : null;
  const recipientsRaw = String(form.get('reminder_recipients') ?? '').trim();
  const reminder_recipients = recipientsRaw
    ? recipientsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const admin = getAdminClient();
  const { data: existing } = await admin
    .from('company_licenses')
    .select('expiry_date')
    .eq('kind', kind)
    .maybeSingle();

  const update: Record<string, unknown> = {
    expiry_date,
    reminder_recipients,
    updated_at: new Date().toISOString(),
    updated_by_staff_id: staff.id,
  };

  // A changed expiry date means the 6-months-before window moves — clear any
  // previously-sent reminder so the new date gets its own reminder later.
  if (!existing || existing.expiry_date !== expiry_date) {
    update.reminder_sent_at = null;
  }

  const file = form.get('file') as File | null;
  if (file && file.size > 0) {
    if (file.type !== 'application/pdf') {
      return redirect('/portail/fournisseurs/licences?error=file_type', 303);
    }
    if (file.size > 15 * 1024 * 1024) {
      return redirect('/portail/fournisseurs/licences?error=file_size', 303);
    }
    try {
      update.file_path = await uploadCompanyLicenseFile(kind, file);
    } catch (e) {
      console.error('[company-licenses/update] upload failed:', e);
      return redirect('/portail/fournisseurs/licences?error=unknown', 303);
    }
  }

  const { error } = await admin
    .from('company_licenses')
    .upsert({ kind, ...update }, { onConflict: 'kind' });
  if (error) {
    console.error('[company-licenses/update] upsert failed:', error);
    return redirect('/portail/fournisseurs/licences?error=unknown', 303);
  }

  return redirect('/portail/fournisseurs/licences?info=saved', 303);
};
