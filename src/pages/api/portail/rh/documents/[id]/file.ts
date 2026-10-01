import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { hrSignedUrl } from '../../../../../../lib/hr-storage';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return new Response('not found', { status: 404 });

  const admin = getAdminClient();
  const { data: doc } = await admin
    .from('hr_generated_documents')
    .select('file_path')
    .eq('id', id)
    .maybeSingle();
  if (!doc?.file_path) return new Response('not found', { status: 404 });

  try {
    const url = await hrSignedUrl(doc.file_path, 60);
    return redirect(url, 302);
  } catch (e) {
    console.error('[rh/documents/file] signed URL failed:', e);
    return new Response('server error', { status: 500 });
  }
};
