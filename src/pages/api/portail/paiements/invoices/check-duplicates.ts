import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid, json, parseAmount } from '../../../../../lib/payables';
import { findDuplicates } from '../../../../../lib/payables-duplicates';

export const prerender = false;

// Called by the new-invoice page while the invoice is reviewed: is it already
// in the portal or in QuickBooks?
export const POST: APIRoute = async ({ request, cookies }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ error: 'invalid' }, 400);

  const admin = getAdminClient();
  const supplierId = isUuid(b.supplier_id) ? String(b.supplier_id) : null;
  let qboVendorId = typeof b.qbo_vendor_id === 'string' && /^\d+$/.test(b.qbo_vendor_id) ? b.qbo_vendor_id : null;
  if (!qboVendorId && supplierId) {
    const { data } = await admin.from('ap_suppliers').select('qbo_vendor_id').eq('id', supplierId).maybeSingle();
    qboVendorId = data?.qbo_vendor_id ?? null;
  }
  const amount = parseAmount(b.amount);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? '')) ? String(b.date) : null;
  try {
    const r = await findDuplicates(admin, {
      supplierId, qboVendorId, number: String(b.number ?? '').trim() || null,
      amount: amount ? Math.abs(amount) : null, date, credit: b.kind === 'credit',
    });
    return json(r);
  } catch (e) {
    console.error('[paiements] duplicate check failed:', e);
    return json({ matches: [], qbChecked: false, error: 'check_failed' });
  }
};
