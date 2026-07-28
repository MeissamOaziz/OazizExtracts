import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { signerUrl } from '../../../../../lib/tokens';
import { sendSignerInvite } from '../../../../../lib/email';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

// In-app signing endpoint — for logged-in staff who have a pending signer_token
// on this submission and want to sign directly without hunting for their email.
// Same effect as POSTing the signature via the tokenized /api/portail/signature
// path, but identifies the signer by session instead of raw token.
export const POST: APIRoute = async ({ params, request, cookies }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return Response.json({ error: 'not_authenticated' }, { status: 401 });

  const { id } = params;
  if (!id) return Response.json({ error: 'no_id' }, { status: 400 });

  let payload: {
    signature?: string;
    rnd_ratings?: Record<string, number | null> | null;
    rnd_comments?: string | null;
    save_signature?: boolean;
  };
  try { payload = await request.json(); }
  catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }

  const signature = (payload.signature ?? '').toString();
  if (!signature.startsWith('data:image/png')) {
    return Response.json({ error: 'signature_missing' }, { status: 400 });
  }
  if (signature.length < 500 || signature.length > 500_000) {
    return Response.json({ error: 'signature_size' }, { status: 400 });
  }

  // Sanitize ratings (same rules as the tokenized endpoint)
  let cleanRatings: Record<string, number> | null = null;
  if (payload.rnd_ratings && typeof payload.rnd_ratings === 'object') {
    const acc: Record<string, number> = {};
    const keys = ['odeur', 'gout', 'texture', 'globale'] as const;
    let ok = true;
    for (const k of keys) {
      const v = payload.rnd_ratings[k];
      if (typeof v === 'number' && v >= 1 && v <= 5) acc[k] = v;
      else ok = false;
    }
    if (ok) cleanRatings = acc;
  }
  const cleanComments = typeof payload.rnd_comments === 'string'
    ? payload.rnd_comments.trim().slice(0, 4000) || null
    : null;

  const ip = readIp(request);
  const ua = request.headers.get('user-agent') ?? null;

  const admin = getAdminClient();

  // 1. Find the pending signer_token for this staff on this submission.
  const { data: token, error: tokErr } = await admin
    .from('signer_tokens')
    .select('id, is_qa, submission_id, staff_id')
    .eq('submission_id', id)
    .eq('staff_id', staff.id)
    .is('completed_at', null)
    .maybeSingle();
  if (tokErr) {
    console.error('[sign-as-me] token lookup failed:', tokErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
  if (!token) return Response.json({ error: 'nothing_to_sign' }, { status: 400 });

  // 2. Update all pending signer rows for this token.
  const { error: sigErr } = await admin
    .from('signers')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signature_image: signature,
      ip_address: ip,
      user_agent: ua,
    })
    .eq('signer_token_id', token.id)
    .eq('status', 'pending');
  if (sigErr) {
    console.error('[sign-as-me] signer update failed:', sigErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  // 3. Persist R&D ratings / comments if this token includes participant/rnd rows.
  if (cleanRatings || cleanComments) {
    const { data: rndRow } = await admin
      .from('signers')
      .select('id')
      .eq('signer_token_id', token.id)
      .eq('role', 'participant')
      .eq('document_kind', 'rnd')
      .limit(1)
      .maybeSingle();
    if (rndRow) {
      await admin
        .from('submission_participants')
        .update({
          rnd_ratings: cleanRatings ?? undefined,
          rnd_comments: cleanComments ?? undefined,
        })
        .eq('submission_id', id)
        .eq('participant_staff_id', staff.id);
    }
  }

  // 4. Save the signature on the staff row if requested.
  if (payload.save_signature === true) {
    await admin.from('staff').update({ saved_signature: signature }).eq('id', staff.id);
  }

  // 5. Complete the token — this fires on_signer_token_completed trigger
  //    which handles just-in-time QA token creation + status transitions.
  const { error: complErr } = await admin
    .from('signer_tokens')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', token.id);
  if (complErr) {
    console.error('[sign-as-me] token completion failed:', complErr);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  // 6. Audit.
  await admin.from('audit_log').insert({
    submission_id: id,
    actor_email: staff.email,
    action: 'signature_captured_in_app',
    ip_address: ip,
    user_agent: ua,
    metadata: { signer_token_id: token.id, is_qa: token.is_qa },
  });

  // 7. Same post-signature dispatch as the tokenized flow: send QA email if
  //    a new QA token was minted by the trigger.
  await dispatchPendingQaEmails(id);

  return Response.json({ ok: true, submission_id: id });
};

async function dispatchPendingQaEmails(submissionId: string): Promise<void> {
  const admin = getAdminClient();
  const { data: rows } = await admin
    .from('audit_log')
    .select('id, metadata')
    .eq('submission_id', submissionId)
    .eq('action', 'qa_token_minted')
    .is('metadata->>emailed_at', null);
  if (!rows || rows.length === 0) return;

  const { data: sub } = await admin
    .from('submissions')
    .select(`id, form_date, product_name, product_type,
             initiator:initiator_staff_id ( full_name )`)
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub) return;
  const initiatorName = (sub.initiator as any)?.full_name ?? '';

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as { staff_id?: string; raw_token?: string; emailed_at?: string };
    if (meta.emailed_at || !meta.raw_token || !meta.staff_id) continue;

    const { data: st } = await admin
      .from('staff').select('id, full_name, email').eq('id', meta.staff_id).maybeSingle();
    if (!st) continue;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await sendSignerInvite({
      toEmail: st.email,
      toName: st.full_name,
      role: 'qa_verifier',
      submission: {
        id: sub.id, form_date: sub.form_date,
        product_name: sub.product_name, product_type: sub.product_type,
        initiator_name: initiatorName,
      },
      signerUrl: signerUrl(meta.raw_token),
      expiresAt,
    });

    const scrubbed = { ...meta, emailed_at: new Date().toISOString(), raw_token: undefined };
    delete (scrubbed as any).raw_token;
    await admin.from('audit_log').update({ metadata: scrubbed }).eq('id', row.id);
  }
}
