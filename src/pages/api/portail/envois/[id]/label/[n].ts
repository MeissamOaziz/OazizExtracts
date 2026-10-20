import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { loadShipment } from '../../../../../../lib/shipments';

export const prerender = false;

// One attached shipping label, opened in the browser to print.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  const n = Number(params.n);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(n) || n < 0) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const s = await loadShipment(admin, id);
  const path = s?.label_paths[n];
  if (!s || !path) return new Response('Not found', { status: 404 });
  const { data: blob, error } = await admin.storage.from('production').download(path);
  if (error || !blob) return new Response('Not found', { status: 404 });
  const ext = path.split('.').pop() ?? 'pdf';
  const type = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;
  return new Response(Buffer.from(await blob.arrayBuffer()), {
    headers: { 'Content-Type': type, 'Content-Disposition': `inline; filename="${s.shipment_no}_etiquette_${n + 1}.${ext}"` },
  });
};
