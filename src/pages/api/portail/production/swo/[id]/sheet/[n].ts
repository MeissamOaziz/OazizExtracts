import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../../lib/supabase';

export const prerender = false;

// One photo of the completed sheet, through a short-lived signed link.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  const n = Number(params.n);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(n)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const { data } = await admin.from('ps_swos').select('sheet_paths').eq('id', id).maybeSingle();
  const path = data?.sheet_paths?.[n];
  if (!path) return new Response('Not found', { status: 404 });
  const { data: signed, error } = await admin.storage.from('production').createSignedUrl(path, 120);
  if (error || !signed?.signedUrl) return new Response('Unavailable', { status: 502 });
  return redirect(signed.signedUrl, 302);
};
