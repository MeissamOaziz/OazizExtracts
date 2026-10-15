import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { getQbo } from '../../../../../lib/qbo';
import { pushVendor, type VendorSubmission } from '../../../../../lib/vendor-qbo';

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
  // Already done (a double click, or a colleague): never make a second vendor.
  if (sub.qbo_vendor_id) return back('');

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const vendorId = String(form.get('vendor_id') ?? '').trim();
  const displayName = String(form.get('display_name') ?? '').trim();
  if (action === 'link' && !/^\d+$/.test(vendorId)) return back('');
  if (action === 'create' && !displayName) return back('');
  if (action !== 'link' && action !== 'create') return back('');

  try {
    const qbo = await getQbo(admin);
    if (!qbo) return back(`error=qb&msg=${encodeURIComponent('QuickBooks non connecté')}`);
    await pushVendor(admin, qbo, sub as VendorSubmission, staff.id,
      action === 'link' ? { linkVendorId: vendorId } : { displayName });
    return back(action === 'link' ? 'info=qb_linked' : 'info=qb_created');
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.error('[vq→qbo] failed:', e);
    await admin.from('qbo_sync_log').insert({ direction: 'push', entity: 'vendor', portal_id: null, status: 'error', message: `VQ ${sub.company_name} : ${msg}` });
    return back(`error=qb&msg=${encodeURIComponent(msg)}`);
  }
};
