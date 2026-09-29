import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { loadAndBuildPdf, storePdf, storagePathFor } from '../../../../../lib/pdf';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

// Privileged correction endpoint for the QA verifier (Stephane Paquin). Unlike
// /update, this never touches signer_tokens/documents or resets status — every
// role's previously-collected signature is left exactly as-is, so a
// fully-executed submission stays fully executed. The only exception is the
// QA verifier's OWN signature: if it was already captured, this endpoint
// requires a freshly-drawn copy (with a new timestamp) to approve the edit.
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return Response.json({ error: 'not_authenticated' }, { status: 401 });

  const { id } = params;
  if (!id) return Response.json({ error: 'no_id' }, { status: 400 });

  const admin = getAdminClient();

  const { data: sub } = await admin
    .from('submissions')
    .select('id, status, qa_staff_id')
    .eq('id', id)
    .maybeSingle();
  if (!sub) return Response.json({ error: 'not_found' }, { status: 404 });
  if (sub.qa_staff_id !== staff.id) {
    return Response.json({ error: 'not_qa' }, { status: 403 });
  }

  let payload: {
    form_date?: string; product_name?: string; product_type?: string; quantity?: string;
    rnd_objective?: string | null; production_state?: string | null;
    production_id?: string | null; packaging_id?: string | null;
    production_staff_id?: string; signature?: string | null;
  };
  try { payload = await request.json(); }
  catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }

  const form_date = (payload.form_date ?? '').trim();
  const product_name = (payload.product_name ?? '').trim();
  const product_type = (payload.product_type ?? '').trim();
  const quantity = (payload.quantity ?? '').trim();
  const production_staff_id = (payload.production_staff_id ?? '').trim();
  const rnd_objective = (typeof payload.rnd_objective === 'string' ? payload.rnd_objective.trim() : '') || null;
  const production_state = (payload.production_state ?? '').trim() || null;
  const production_id = (typeof payload.production_id === 'string' ? payload.production_id.trim() : '') || null;
  const packaging_id = (typeof payload.packaging_id === 'string' ? payload.packaging_id.trim() : '') || null;

  if (!form_date || !product_name || !product_type || !quantity || !production_staff_id) {
    return Response.json({ error: 'missing' }, { status: 400 });
  }
  if (production_state && production_state !== 'vrac' && production_state !== 'emballe') {
    return Response.json({ error: 'invalid_state' }, { status: 400 });
  }

  // Has the QA verifier already signed off on this submission? If so, every
  // one of those rows (one per participant's R&D document) must be refreshed
  // with a new signature + timestamp to approve this correction — everyone
  // else's signature is untouched.
  const { data: qaSignerRows } = await admin
    .from('signers')
    .select('id')
    .eq('submission_id', id)
    .eq('role', 'qa_verifier')
    .eq('status', 'signed');
  const needsResign = (qaSignerRows?.length ?? 0) > 0;

  const signature = typeof payload.signature === 'string' ? payload.signature : null;
  if (needsResign) {
    if (!signature || !signature.startsWith('data:image/png')) {
      return Response.json({ error: 'signature_required' }, { status: 400 });
    }
    if (signature.length < 500 || signature.length > 500_000) {
      return Response.json({ error: 'signature_size' }, { status: 400 });
    }
  }

  const ip = readIp(request);
  const ua = request.headers.get('user-agent') ?? null;

  const { error: updErr } = await admin
    .from('submissions')
    .update({
      form_date, product_name, product_type, quantity, rnd_objective,
      production_state: production_state as 'vrac' | 'emballe' | null,
      production_id, packaging_id, production_staff_id,
    })
    .eq('id', id);
  if (updErr) {
    console.error('[qa-edit] submission update failed:', updErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  if (needsResign) {
    const { error: sigErr } = await admin
      .from('signers')
      .update({
        signature_image: signature,
        signed_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: ua,
      })
      .eq('submission_id', id)
      .eq('role', 'qa_verifier')
      .eq('status', 'signed');
    if (sigErr) {
      console.error('[qa-edit] signature refresh failed:', sigErr);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  }

  // Regenerate the stored PDF so it reflects the correction (and the
  // refreshed QA signature, when applicable). Best-effort: a submission that
  // never reached the QA stage may not have a meaningful cached PDF yet.
  try {
    const pdfBytes = await loadAndBuildPdf(id);
    await storePdf(id, pdfBytes);
    await admin.from('documents').upsert({
      submission_id: id,
      kind: 'sample_request',
      participant_staff_id: null,
      pdf_path: storagePathFor(id),
    }, { onConflict: 'submission_id' });
  } catch (e) {
    console.warn('[qa-edit] PDF regeneration failed:', e);
  }

  await admin.from('audit_log').insert({
    submission_id: id,
    actor_email: staff.email,
    action: 'qa_correction_edit',
    ip_address: ip,
    user_agent: ua,
    metadata: { resigned: needsResign, status_at_edit: sub.status },
  });

  return Response.json({ ok: true, resigned: needsResign });
};
