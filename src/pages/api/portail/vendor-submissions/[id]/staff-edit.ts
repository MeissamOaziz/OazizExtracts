import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import type { Permission } from '../../../../../lib/access';
import {
  invalidUpload, readVendorFields, reminderResets, sendForApproval, uploadAnyProvidedFiles,
} from '../../../../../lib/vendor-form-parse';

export const prerender = false;

// Oaziz staff (VQ access) fill in or correct a vendor's file for them — e.g. a
// vendor who emailed their licenses instead of completing the form — and can
// submit a draft for approval. The vendor's attestation is never touched.
export const POST: APIRoute = async ({ request, cookies, params, redirect, locals }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const perms: ReadonlySet<Permission> = locals.access?.perms ?? new Set<Permission>();
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return redirect('/portail/fournisseurs', 303);
  const back = (q: string) => redirect(`/portail/fournisseurs/${id}${q}`, 303);
  const edit = (q: string) => redirect(`/portail/fournisseurs/${id}/modifier?${q}`, 303);
  if (!perms.has('vq')) return back('?error=forbidden');

  const admin = getAdminClient();
  const { data: existing } = await admin.from('vendor_submissions').select('*').eq('id', id).maybeSingle();
  if (!existing) return redirect('/portail/fournisseurs', 303);

  const form = await request.formData();
  const submit = String(form.get('action') ?? '') === 'submit' && existing.status === 'draft';
  const { certified: _c, certified_by_name: _n, certified_by_title: _t, ...fields } = readVendorFields(form);
  if (!fields.company_name) return edit('error=company_required');
  const bad = invalidUpload(form);
  if (bad) return edit(`error=${bad}`);

  // What changed, for the history line (blank, null and [] all mean "nothing").
  const norm = (v: unknown) => (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) ? null : v);
  const changed = Object.keys(fields).filter((k) =>
    JSON.stringify(norm((fields as Record<string, unknown>)[k])) !== JSON.stringify(norm(existing[k])));

  const { error } = await admin.from('vendor_submissions')
    .update({ ...fields, ...reminderResets(readVendorFields(form), existing), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('[vq-staff] save failed:', error); return edit('error=unknown'); }
  let uploaded: string[] = [];
  try {
    uploaded = await uploadAnyProvidedFiles(admin, id, form);
  } catch (e) {
    console.error('[vq-staff] upload failed:', e);
    return edit('error=unknown');
  }

  const fileLabel: Record<string, string> = {
    file_cra_license_path: 'licence ARC', file_health_canada_license_path: 'licence Santé Canada', file_bank_void_cheque_path: 'preuve bancaire',
  };
  const parts = [
    ...(uploaded.length ? [`documents : ${uploaded.map((c) => fileLabel[c] ?? c).join(', ')}`] : []),
    ...(changed.length ? [`${changed.length} champ(s) : ${changed.join(', ')}`] : []),
  ];
  if (parts.length) {
    await admin.from('vendor_submission_events').insert({
      vendor_submission_id: id, staff_id: staff.id, decision: 'staff_edited', note: parts.join(' — ').slice(0, 1000),
    });
  }

  if (submit) {
    const { error: sErr } = await admin.from('vendor_submissions').update({
      status: 'submitted', submitted_at: new Date().toISOString(), resume_token_hash: null,
    }).eq('id', id).eq('status', 'draft');
    if (sErr) { console.error('[vq-staff] submit failed:', sErr); return edit('error=unknown'); }
    await admin.from('vendor_submission_events').insert({ vendor_submission_id: id, staff_id: staff.id, decision: 'staff_submitted' });
    await sendForApproval(admin, id, fields.company_name);
    return back('?info=staff_submitted');
  }
  return back('?info=staff_saved');
};
