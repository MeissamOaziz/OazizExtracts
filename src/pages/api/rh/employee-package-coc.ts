import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { sha256Hex } from '../../../lib/tokens';
import { hrSignedUrl } from '../../../lib/hr-storage';

export const prerender = false;

// Public, token-gated redirect to the current Code of Conduct PDF (in the
// package's assigned language) — used by the new-employee onboarding page so
// they can review it before signing the acknowledgment.
export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) return new Response('Not found', { status: 404 });

  const admin = getAdminClient();
  const { data: pkg } = await admin
    .from('hr_employee_packages')
    .select('language')
    .eq('access_token_hash', sha256Hex(token))
    .maybeSingle();
  if (!pkg) return new Response('Not found', { status: 404 });

  const { data: doc } = await admin
    .from('company_hr_documents')
    .select('file_path')
    .eq('kind', `code_of_conduct_${pkg.language}`)
    .maybeSingle();
  if (!doc?.file_path) return new Response('Not found', { status: 404 });

  const signedUrl = await hrSignedUrl(doc.file_path, 120);
  return redirect(signedUrl, 303);
};
