import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { vendorFileSignedUrl } from '../../../../../../lib/vendor-storage';

export const prerender = false;

const COLUMN_BY_KIND: Record<string, string> = {
  cra: 'file_cra_license_path',
  hc: 'file_health_canada_license_path',
  bank: 'file_bank_void_cheque_path',
};

export const GET: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id, kind } = params;
  const column = kind ? COLUMN_BY_KIND[kind] : undefined;
  if (!id || !column) return new Response('not found', { status: 404 });

  const admin = getAdminClient();
  const { data: submission } = await admin
    .from('vendor_submissions')
    .select('file_cra_license_path, file_health_canada_license_path, file_bank_void_cheque_path')
    .eq('id', id)
    .maybeSingle();

  const path = submission ? (submission as unknown as Record<string, string | null>)[column] : null;
  if (!path) return new Response('not found', { status: 404 });

  try {
    const url = await vendorFileSignedUrl(path, 60);
    return redirect(url, 302);
  } catch (e) {
    console.error('[vendor-files] signed URL failed:', e);
    return new Response('server error', { status: 500 });
  }
};
