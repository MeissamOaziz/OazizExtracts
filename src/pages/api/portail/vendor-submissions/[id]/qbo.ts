import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { getQbo } from '../../../../../lib/qbo';
import { completeVendor, draftFromForm, pushVendor, type VendorSubmission } from '../../../../../lib/vendor-qbo';

export const prerender = false;

// "Copy to QuickBooks" on a VQ: create the QB vendor, or link the VQ to a vendor
// that already exists. Accountants only (Payments access).
export const POST: APIRoute = async ({ params, request, cookies, redirect, locals }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return redirect('/portail/fournisseurs', 303);
  const back = (q: string) => redirect(`/portail/fournisseurs/${id}?${q}#quickbooks`, 303);
  if (!locals.access?.perms?.has('payables')) return back('error=qb_forbidden');

  const admin = getAdminClient();
  const { data: sub } = await admin.from('vendor_submissions').select('*').eq('id', id).maybeSingle();
  if (!sub || sub.status !== 'submitted') return redirect(`/portail/fournisseurs/${id}`, 303);
  const form = await request.formData();
  const action = String(form.get('_action') ?? '');

  // Fill in, on the vendor already copied, what QuickBooks did not keep.
  if (action === 'complete' && sub.qbo_vendor_id) {
    try {
      const qbo = await getQbo(admin);
      if (!qbo) return back(`error=qb&msg=${encodeURIComponent('QuickBooks non connecté')}`);
      const v = (k: string) => String(form.get(k) ?? '').trim() || null;
      await completeVendor(admin, qbo, sub as never, staff.id, { businessNumber: v('business_number'), bankAcct: v('bank_acct') });
      return back('info=qb_completed');
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      console.error('[vq→qbo] complete failed:', e);
      return back(`error=qb&msg=${encodeURIComponent(msg)}`);
    }
  }
  // Already done (a double click, or a colleague): never make a second vendor.
  if (sub.qbo_vendor_id) return back('');
  // A file an approver rejected is not a supplier.
  const { count: rejectedCount } = await admin.from('vendor_submission_approvals')
    .select('id', { count: 'exact', head: true }).eq('vendor_submission_id', id).eq('decision', 'rejected');
  if (rejectedCount) return back(`error=qb&msg=${encodeURIComponent('dossier rejeté')}`);
  const vendorId = String(form.get('vendor_id') ?? '').trim();
  if (action === 'link' && !/^\d+$/.test(vendorId)) return back('');
  if (action !== 'link' && action !== 'create') return back('');
  const draft = action === 'create' ? draftFromForm(form) : null;
  if (draft && 'error' in draft) return back(`error=qb&msg=${encodeURIComponent(draft.error)}`);

  try {
    const qbo = await getQbo(admin);
    if (!qbo) return back(`error=qb&msg=${encodeURIComponent('QuickBooks non connecté')}`);
    await pushVendor(admin, qbo, sub as VendorSubmission, staff.id,
      action === 'link' ? { linkVendorId: vendorId } : { draft: draft! });
    return back(action === 'link' ? 'info=qb_linked' : 'info=qb_created');
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.error('[vq→qbo] failed:', e);
    await admin.from('qbo_sync_log').insert({ direction: 'push', entity: 'vendor', portal_id: null, status: 'error', message: `VQ ${sub.company_name} : ${msg}` });
    return back(`error=qb&msg=${encodeURIComponent(msg)}`);
  }
};
