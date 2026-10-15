import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { buildSwoPdf, loadSwo } from '../../../../../../lib/production-swo';

export const prerender = false;

// The printable shipping work order, opened in the browser to print.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const swo = await loadSwo(admin, id);
  if (!swo) return new Response('Not found', { status: 404 });
  const { data: req } = await admin.from('ps_requests').select('request_no').eq('id', swo.request_id).maybeSingle();
  const pdf = await buildSwoPdf(swo, { requestNo: req?.request_no });
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${swo.swo_no}.pdf"` },
  });
};
