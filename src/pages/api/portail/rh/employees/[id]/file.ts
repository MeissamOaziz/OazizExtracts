import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { hrSignedUrl } from '../../../../../../lib/hr-storage';

export const prerender = false;

export const GET: APIRoute = async ({ params, url, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  const doc = url.searchParams.get('doc');
  if (!id || !['info', 'coc', 'coc_reference'].includes(doc ?? '')) return new Response('Not found', { status: 404 });

  const admin = getAdminClient();
  const { data: pkg } = await admin
    .from('hr_employee_packages')
    .select('language, info_pdf_path, coc_pdf_path')
    .eq('id', id)
    .maybeSingle();
  if (!pkg) return new Response('Not found', { status: 404 });

  let path: string | null;
  if (doc === 'coc_reference') {
    const { data: refDoc } = await admin
      .from('company_hr_documents')
      .select('file_path')
      .eq('kind', `code_of_conduct_${pkg.language}`)
      .maybeSingle();
    path = refDoc?.file_path ?? null;
  } else {
    path = doc === 'info' ? pkg.info_pdf_path : pkg.coc_pdf_path;
  }
  if (!path) return new Response('Not found', { status: 404 });

  const signedUrl = await hrSignedUrl(path, 60);
  return redirect(signedUrl, 303);
};
