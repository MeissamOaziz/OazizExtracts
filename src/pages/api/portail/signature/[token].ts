import type { APIRoute } from 'astro';
import { getAnonServerClient, getAdminClient } from '../../../../lib/supabase';
import { signerUrl } from '../../../../lib/tokens';
import { sendSignerInvite } from '../../../../lib/email';

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

  let payload: { signature?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const signature = (payload.signature ?? '').toString();
  if (!signature.startsWith('data:image/png')) {
    return Response.json({ error: 'signature_missing' }, { status: 400 });
  }

  const ip = readIp(request);
  const ua = request.headers.get('user-agent') ?? null;

  // Call the SECURITY DEFINER RPC with an anon client — least privilege for
  // the raw path a browser would take.
  const anon = getAnonServerClient();
  const { data, error } = await anon.rpc('submit_signature', {
    raw_token: raw,
    signature_data: signature,
    signer_ip: ip,
    signer_ua: ua,
  });

  if (error) {
    console.error('submit_signature RPC error:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
  if (data?.error) {
    return Response.json({ error: data.error }, { status: 400 });
  }

  // Post-signature: check for any newly-minted QA tokens that need emailing.
  // The trigger stashes the raw QA token in audit_log; we drain it here.
  await dispatchPendingQaEmails(data?.submission_id ?? null);

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
