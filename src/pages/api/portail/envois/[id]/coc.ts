import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { localDay, todayLocal } from '../../../../../lib/production';
import { loadSwo } from '../../../../../lib/production-swo';
import { loadShipment } from '../../../../../lib/shipments';
import { buildCocPdf, cocDataFor, cocFilename } from '../../../../../lib/coc';

export const prerender = false;

// The Chain of Custody of a shipment (PDF to print), once it has a number.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const s = await loadShipment(admin, id);
  if (!s?.coc_no) return new Response('Not found', { status: 404 });
  const swo = await loadSwo(admin, s.swo_id);
  const day = s.label_ready_at ? localDay(s.label_ready_at) : todayLocal();
  const pdf = await buildCocPdf(cocDataFor(s, swo?.lines ?? [], day));
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${cocFilename(s.coc_no, s.customer_name)}"` },
  });
};
