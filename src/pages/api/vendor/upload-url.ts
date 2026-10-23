import type { APIRoute } from 'astro';
import { createStagedUpload } from '../../../lib/vendor-storage';

export const prerender = false;

// A one-time upload URL for one file of the vendor form, which the browser
// uploads to directly before posting the form (see VendorFormFields.astro).
// Public like the form itself; the URL only allows that one path, and the
// bucket refuses anything over 10 MB or that is not a PDF or an image.
const KIND_BY_FIELD: Record<string, string> = {
  file_cra_license: 'cra-license',
  file_health_canada_license: 'health-canada-license',
  file_bank_proof: 'bank-proof',
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as { field?: string; type?: string; size?: number } | null;
  const kind = KIND_BY_FIELD[String(body?.field ?? '')];
  if (!kind) return Response.json({ error: 'invalid_kind' }, { status: 400 });
  try {
    const r = await createStagedUpload(kind, String(body?.type ?? ''), Number(body?.size));
    if (typeof r === 'string') return Response.json({ error: r }, { status: 400 });
    return Response.json(r);
  } catch (e) {
    console.error('[vendor-upload] signed URL failed:', e);
    return Response.json({ error: 'upload' }, { status: 500 });
  }
};
