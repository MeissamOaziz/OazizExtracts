import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { loadSwo } from '../../../../../../lib/production-swo';
import { loadShipmentForSwo } from '../../../../../../lib/shipments';
import { loadSkus, skuCustomer } from '../../../../../../lib/customer-skus';
import { buildPackingList, packingListFilename } from '../../../../../../lib/packing-list';

export const prerender = false;

// The packing list (Word) of a work order, prefilled from it and its shipment.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const swo = await loadSwo(admin, id);
  if (!swo) return new Response('Not found', { status: 404 });
  const custKey = skuCustomer(swo.customer_name);
  const docx = await buildPackingList(swo, await loadShipmentForSwo(admin, id), custKey ? await loadSkus(admin, custKey) : []);
  return new Response(docx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${packingListFilename(swo)}"`,
    },
  });
};
