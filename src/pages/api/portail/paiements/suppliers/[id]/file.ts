import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { isUuid, signedFileUrl } from '../../../../../../lib/payables';

export const prerender = false;

// Redirect to a short-lived signed URL for an invoice attachment.
export const GET: APIRoute = async ({ request, cookies, params, url, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const invoiceId = url.searchParams.get('invoice');
  if (!isUuid(params.id) || !isUuid(invoiceId)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const { data } = await admin.from('ap_invoices').select('file_path').eq('id', invoiceId).eq('supplier_id', params.id).maybeSingle();
  if (!data?.file_path) return new Response('Not found', { status: 404 });
  const signed = await signedFileUrl(admin, data.file_path);
  return signed ? redirect(signed, 302) : new Response('Not found', { status: 404 });
};
