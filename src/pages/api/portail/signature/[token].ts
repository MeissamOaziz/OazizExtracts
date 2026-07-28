import type { APIRoute } from 'astro';
import { getAnonServerClient, getAdminClient } from '../../../../lib/supabase';
import { signerUrl } from '../../../../lib/tokens';
import { sendSignerInvite } from '../../../../lib/email';
import { finalizeIfNeeded } from '../../../../lib/finalize';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

export const POST: APIRoute = async ({ params, request }) => {
  const raw = (params.token ?? '').trim();
  if (!raw || raw.length < 16) {
    return Response.json({ error: 'invalid_token' }, { status: 400 });
  }

  let payload: {
    signature?: string;
    rnd_ratings?: Record<string, number | null> | null;
    rnd_comments?: string | null;
    save_signature?: boolean;
    // QA-only: destruction record fields
    rnd_destruction_id?: string | null;
    rnd_qty_destroyed?: string | null;
    rnd_date_destroyed?: string | null;
  };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const signature = (payload.signature ?? '').toString();
  if (!signature.startsWith('data:image/png')) {
    return Response.json({ error: 'signature_missing' }, { status: 400 });
  }

  // Sanitize ratings to just the four expected keys with 1-5 integers; anything
  // else becomes null. If any expected key is missing, drop the whole ratings
  // payload so the RPC won't half-write it.
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

  const anon = getAnonServerClient();
  const { data, error } = await anon.rpc('submit_signature', {
    raw_token: raw,
    signature_data: signature,
    signer_ip: ip,
    signer_ua: ua,
    rnd_ratings: cleanRatings,
    rnd_comments: cleanComments,
    save_signature: payload.save_signature === true,
  });

  if (error) {
    console.error('submit_signature RPC error:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
  if (data?.error) {
    return Response.json({ error: data.error }, { status: 400 });
  }

  // If the RPC confirms this signer was the QA verifier AND the caller sent
  // destruction fields, persist them onto the submission (admin client since
  // signers can't edit submissions directly via RLS).
  if (data?.is_qa === true) {
    const destroyId = typeof payload.rnd_destruction_id === 'string'
      ? payload.rnd_destruction_id.trim().slice(0, 200) : '';
    const destroyQty = typeof payload.rnd_qty_destroyed === 'string'
      ? payload.rnd_qty_destroyed.trim().slice(0, 100) : '';
    const destroyDate = typeof payload.rnd_date_destroyed === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(payload.rnd_date_destroyed)
      ? payload.rnd_date_destroyed : '';
    if (destroyId || destroyQty || destroyDate) {
      const admin = getAdminClient();
      const update: Record<string, unknown> = {};
      if (destroyId)   update.rnd_destruction_id = destroyId;
      if (destroyQty)  update.rnd_qty_destroyed  = destroyQty;
      if (destroyDate) update.rnd_date_destroyed = destroyDate;
      const { error: destErr } = await admin
        .from('submissions').update(update).eq('id', data.submission_id);
      if (destErr) console.error('[signature] QA destruction update failed:', destErr);
    }
  }

  // Post-signature: check for any newly-minted QA tokens that need emailing.
  await dispatchPendingQaEmails(data?.submission_id ?? null);
  // And: if this signature just finalized the submission (QA signed last),
  // build + email the final PDF to the distribution list.
  await finalizeIfNeeded(data?.submission_id ?? null);

  return Response.json({ ok: true, submission_id: data?.submission_id });
};

async function dispatchPendingQaEmails(submissionId: string | null): Promise<void> {
  if (!submissionId) return;
  const admin = getAdminClient();

  const { data: rows, error } = await admin
    .from('audit_log')
    .select('id, metadata, submission_id')
    .eq('submission_id', submissionId)
    .eq('action', 'qa_token_minted')
    .is('metadata->>emailed_at', null);

  if (error || !rows || rows.length === 0) return;

  // We also need the submission details for the email body.
  const { data: sub } = await admin
    .from('submissions')
    .select(`
      id, form_date, product_name, product_type,
      initiator:initiator_staff_id ( full_name )
    `)
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub) return;

  const initiatorName = (sub.initiator as any)?.full_name ?? '';

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as { staff_id?: string; raw_token?: string; emailed_at?: string };
    if (meta.emailed_at) continue;
    if (!meta.raw_token || !meta.staff_id) continue;

    const { data: staff } = await admin
      .from('staff')
      .select('id, full_name, email')
      .eq('id', meta.staff_id)
      .maybeSingle();
    if (!staff) continue;

    // Expiry mirrors what the trigger set (30 days).
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await sendSignerInvite({
      toEmail: staff.email,
      toName: staff.full_name,
      role: 'qa_verifier',
      submission: {
        id: sub.id,
        form_date: sub.form_date,
        product_name: sub.product_name,
        product_type: sub.product_type,
        initiator_name: initiatorName,
      },
      signerUrl: signerUrl(meta.raw_token),
      expiresAt,
    });

    // Mark as emailed AND redact the raw token from metadata.
    const scrubbed = { ...meta, emailed_at: new Date().toISOString(), raw_token: undefined };
    delete (scrubbed as any).raw_token;
    await admin.from('audit_log').update({ metadata: scrubbed }).eq('id', row.id);
  }
}
