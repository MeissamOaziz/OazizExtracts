import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { loadAndBuildPdf, storePdf, storagePathFor } from '../../../../../lib/pdf';
import { dispatchSignatureInvites } from '../../../../../lib/send-signatures';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

type Action = 'save' | 'resend' | 'complete';

// Privileged correction endpoint for the QA verifier. Three ways this can end,
// decided mostly by what has already been signed:
//   - No signature exists yet anywhere on the submission → same as the
//     creator's normal edit: wipe tokens/documents, reset to draft.
//   - Some signature exists (half- or fully-signed) and QA chose to resend
//     ("action=resend") → same wipe, then fresh signer_tokens + invite emails
//     go out to everyone (old links stop working).
//   - Some signature exists and QA chose NOT to resend ("action=complete" /
//     "action=save") → nobody else's signer_tokens/signers rows are touched.
//     If QA had already signed, that signature is refreshed with a new
//     timestamp using the freshly-drawn one from this request; otherwise the
//     data is just saved in place and the normal signing flow continues
//     wherever it left off.
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
    action?: Action;
    form_date?: string; product_name?: string; product_type?: string; quantity?: string;
    rnd_objective?: string | null; production_state?: string | null;
    production_id?: string | null; packaging_id?: string | null;
    production_staff_id?: string; signature?: string | null;
  };
  try { payload = await request.json(); }
  catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }

  const action: Action = payload.action === 'resend' || payload.action === 'complete' ? payload.action : 'save';

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

  const fields = {
    form_date, product_name, product_type, quantity, rnd_objective,
    production_state: production_state as 'vrac' | 'emballe' | null,
    production_id, packaging_id, production_staff_id,
  };

  const ip = readIp(request);
  const ua = request.headers.get('user-agent') ?? null;

  // Has ANY signature already been collected — by a participant, the
  // sample-request signers, or QA? This is the authoritative check (not the
  // client-sent action) for whether we're allowed to just overwrite in place.
  const { data: anySignedRows } = await admin
    .from('signers')
    .select('id')
    .eq('submission_id', id)
    .eq('status', 'signed')
    .limit(1);
  const hasAnySignature = (anySignedRows?.length ?? 0) > 0;

  // ---- Case 1: nothing signed yet anywhere — same as the creator's normal edit. ----
  if (!hasAnySignature) {
    await admin.from('signer_tokens').delete().eq('submission_id', id);
    await admin.from('documents').delete().eq('submission_id', id);
    try { await admin.storage.from('documents').remove([storagePathFor(id)]); } catch { /* nothing cached yet, fine */ }

    const { error: updErr } = await admin
      .from('submissions')
      .update({ ...fields, status: 'draft', sent_at: null, finalized_at: null })
      .eq('id', id);
    if (updErr) {
      console.error('[qa-edit] submission update failed:', updErr);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }

    await admin.from('audit_log').insert({
      submission_id: id, actor_email: staff.email, action: 'qa_correction_edit',
      ip_address: ip, user_agent: ua, metadata: { mode: 'reset_draft', status_at_edit: sub.status },
    });
    return Response.json({ ok: true, mode: 'reset_draft' });
  }

  // ---- Case 2: something's already signed, and QA chose to resend to everyone. ----
  if (action === 'resend') {
    await admin.from('signer_tokens').delete().eq('submission_id', id);
    await admin.from('documents').delete().eq('submission_id', id);
    try { await admin.storage.from('documents').remove([storagePathFor(id)]); } catch { /* best-effort */ }

    const { error: updErr } = await admin
      .from('submissions')
      .update({ ...fields, sent_at: null, finalized_at: null })
      .eq('id', id);
    if (updErr) {
      console.error('[qa-edit] submission update failed:', updErr);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }

    const result = await dispatchSignatureInvites(id);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    await admin.from('audit_log').insert({
      submission_id: id, actor_email: staff.email, action: 'qa_correction_edit',
      ip_address: ip, user_agent: ua, metadata: { mode: 'resend', status_at_edit: sub.status },
    });
    return Response.json({ ok: true, mode: 'resend' });
  }

  // ---- Case 3: something's already signed, QA chose NOT to resend. ----
  // Nobody else's signer_tokens/signers rows are touched at all.
  const { data: qaSignedRows } = await admin
    .from('signers')
    .select('id')
    .eq('submission_id', id)
    .eq('role', 'qa_verifier')
    .eq('status', 'signed');
  const qaAlreadySigned = (qaSignedRows?.length ?? 0) > 0;

  if (action === 'complete' && !qaAlreadySigned) {
    // Client shouldn't offer this button in this state — nothing to approve yet.
    return Response.json({ error: 'nothing_to_sign' }, { status: 400 });
  }

  const signature = typeof payload.signature === 'string' ? payload.signature : null;
  if (action === 'complete') {
    if (!signature || !signature.startsWith('data:image/png')) {
      return Response.json({ error: 'signature_required' }, { status: 400 });
    }
    if (signature.length < 500 || signature.length > 500_000) {
      return Response.json({ error: 'signature_size' }, { status: 400 });
    }
  }

  const { error: updErr } = await admin.from('submissions').update(fields).eq('id', id);
  if (updErr) {
    console.error('[qa-edit] submission update failed:', updErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  if (action === 'complete') {
    const { error: sigErr } = await admin
      .from('signers')
      .update({ signature_image: signature, signed_at: new Date().toISOString(), ip_address: ip, user_agent: ua })
      .eq('submission_id', id)
      .eq('role', 'qa_verifier')
      .eq('status', 'signed');
    if (sigErr) {
      console.error('[qa-edit] signature refresh failed:', sigErr);
      return Response.json({ error: 'server_error' }, { status: 500 });
    }
  }

  // Regenerate the stored PDF so it reflects the correction (and the
  // refreshed QA signature, when applicable).
  try {
    const pdfBytes = await loadAndBuildPdf(id);
    await storePdf(id, pdfBytes);
    await admin.from('documents').upsert({
      submission_id: id, kind: 'sample_request', participant_staff_id: null, pdf_path: storagePathFor(id),
    }, { onConflict: 'submission_id' });
  } catch (e) {
    console.warn('[qa-edit] PDF regeneration failed:', e);
  }

  await admin.from('audit_log').insert({
    submission_id: id, actor_email: staff.email, action: 'qa_correction_edit',
    ip_address: ip, user_agent: ua, metadata: { mode: action === 'complete' ? 'complete' : 'save_keep', status_at_edit: sub.status },
  });

  return Response.json({ ok: true, mode: action === 'complete' ? 'complete' : 'save_keep' });
};
