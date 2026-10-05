import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { json, isUuid } from '../../../../../lib/payables';
import { connectionInfo } from '../../../../../lib/qbo';
import { qboLists, suggestCoding } from '../../../../../lib/qbo-sync';

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
    return json({
      connected: true, suggestion,
      accounts: lists?.expenseAccounts ?? [], taxCodes: lists?.taxCodes ?? [],
    });
  } catch (e) {
    console.error('[qbo] suggest failed:', e);
    return json({ connected: true, error: e instanceof Error ? e.message : String(e) }, 200);
  }
};
