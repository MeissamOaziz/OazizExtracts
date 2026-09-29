import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { companyLicenseSignedUrl } from '../../../../../lib/company-license-storage';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { kind } = params;
  if (kind !== 'cra' && kind !== 'health_canada') return new Response('not found', { status: 404 });

  const admin = getAdminClient();
  const { data: license } = await admin
    .from('company_licenses')
    .select('file_path')
    .eq('kind', kind)
    .maybeSingle();
  if (!license?.file_path) return new Response('not found', { status: 404 });

  try {
    const url = await companyLicenseSignedUrl(license.file_path, 60);
    return redirect(url, 302);
  } catch (e) {
    console.error('[company-licenses/file] signed URL failed:', e);
    return new Response('server error', { status: 500 });
  }
};
