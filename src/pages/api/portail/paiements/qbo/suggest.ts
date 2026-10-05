import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { json, isUuid } from '../../../../../lib/payables';
import { connectionInfo } from '../../../../../lib/qbo';
import { matchVendor, qboLists, suggestCoding } from '../../../../../lib/qbo-sync';

export const prerender = false;

// QB coding for the invoice review form: the account/tax code this supplier's
// previous QB bills used, plus the lists to choose from.
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const admin = getAdminClient();
  if (!(await connectionInfo(admin))) return json({ connected: false });
  try {
    const lists = await qboLists(admin);
    const supplierId = url.searchParams.get('supplier_id');
    const suggestion = isUuid(supplierId) ? await suggestCoding(admin, supplierId) : null;
    const vendors = (lists?.vendors ?? []).map((v) => ({ id: v.id, name: v.name }));
    let vendorId: string | null = null;
    if (isUuid(supplierId)) {
      const { data: s } = await admin.from('ap_suppliers').select('name, legal_name, qbo_vendor_name, qbo_vendor_id, aliases').eq('id', supplierId).maybeSingle();
      vendorId = s?.qbo_vendor_id ?? matchVendor(vendors, [
        url.searchParams.get('vendor_name'), url.searchParams.get('vendor_legal_name'),
        s?.qbo_vendor_name, s?.legal_name, s?.name, ...((s?.aliases as string[] | null) ?? []),
      ]);
    } else {
      vendorId = matchVendor(vendors, [url.searchParams.get('vendor_name'), url.searchParams.get('vendor_legal_name')]);
    }
    return json({
      connected: true, suggestion, vendors, vendorId,
      accounts: lists?.expenseAccounts ?? [], taxCodes: lists?.taxCodes ?? [],
    });
  } catch (e) {
    console.error('[qbo] suggest failed:', e);
    return json({ connected: true, error: e instanceof Error ? e.message : String(e) }, 200);
  }
};
