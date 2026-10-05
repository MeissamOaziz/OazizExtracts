import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';

export const prerender = false;

// Hand back a short-lived signed URL for one order attachment.
//
// The row is read through the RLS-bound client first, so a caller who cannot see
// the attachment cannot get a link to it; only then does the service-role client
// mint the signed URL, since the bucket is private.

export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const id = String(params.attachmentId ?? '');

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);

  const { data: att } = await supabase
    .from('ops_order_attachments')
    .select('storage_path, filename')
    .eq('id', id)
    .maybeSingle();

  if (!att) return new Response('Not found', { status: 404 });

  const admin = getAdminClient();
  const { data, error } = await admin.storage
    .from('atelier')
    .createSignedUrl(att.storage_path, 120, { download: att.filename });

  if (error || !data?.signedUrl) {
    console.error('[atelier] signed url failed:', error);
    return new Response('Unavailable', { status: 502 });
  }

  return redirect(data.signedUrl, 302);
};
