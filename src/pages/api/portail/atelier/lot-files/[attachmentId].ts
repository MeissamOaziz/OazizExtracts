import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';

export const prerender = false;

// Short-lived signed URL for a lot document (COA and the like). The row is read
// through RLS first, so a caller who cannot see the lot cannot get a link to it.

export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const id = String(params.attachmentId ?? '');

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);

  const { data: att } = await supabase
    .from('ops_lot_attachments')
    .select('storage_path, filename')
    .eq('id', id)
    .maybeSingle();

  if (!att) return new Response('Not found', { status: 404 });

  const admin = getAdminClient();
  const { data, error } = await admin.storage
    .from('atelier')
    .createSignedUrl(att.storage_path, 120, { download: att.filename });

  if (error || !data?.signedUrl) {
    console.error('[atelier] lot file signed url failed:', error);
    return new Response('Unavailable', { status: 502 });
  }
  return redirect(data.signedUrl, 302);
};
