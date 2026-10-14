import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';

export const prerender = false;

// A short-lived signed link to one request file. The bucket is private; access
// to this route is already limited to people with request or planning access.
export const GET: APIRoute = async ({ request, cookies, params, redirect, url }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);

  const id = String(params.fileId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const { data: f } = await admin.from('ps_request_files').select('storage_path, filename').eq('id', id).maybeSingle();
  if (!f) return new Response('Not found', { status: 404 });

  // ?view=1 opens it in the browser (PDF, image); otherwise it downloads.
  const { data, error } = await admin.storage.from('production')
    .createSignedUrl(f.storage_path, 120, url.searchParams.get('view') ? undefined : { download: f.filename });
  if (error || !data?.signedUrl) {
    console.error('[production] signed url failed:', error);
    return new Response('Unavailable', { status: 502 });
  }
  return redirect(data.signedUrl, 302);
};
