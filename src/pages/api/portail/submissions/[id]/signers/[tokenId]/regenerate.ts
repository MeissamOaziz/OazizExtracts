import type { APIRoute } from 'astro';
import {
  createServerClient,
  currentStaff,
  getAdminClient,
} from '../../../../../../../lib/supabase';
import { mintToken, signerUrl } from '../../../../../../../lib/tokens';
import { sendSignerInvite } from '../../../../../../../lib/email';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

const TOKEN_TTL_DAYS = 30;

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id, tokenId } = params;
  if (!id || !tokenId) return redirect('/portail/formulaires');

  const backTo = `/portail/demande/${id}`;

  // Guard: only the creator can regenerate; must be in a live sending state.
  const { data: submission } = await supabase
    .from('submissions')
    .select('id, status, created_by_email, form_date, product_name, product_type, initiator:initiator_staff_id ( full_name )')
    .eq('id', id)
    .maybeSingle();

  if (!submission) return redirect(`${backTo}?error=not_found`, 303);
  if (submission.created_by_email !== staff.email) {
    return redirect(`${backTo}?error=not_creator`, 303);
  }
  if (!['sent', 'signing', 'complete'].includes(submission.status)) {
    return redirect(`${backTo}?error=already_sent`, 303);
  }

  const admin = getAdminClient();

  // Load the target signer_token — must belong to this submission and still be pending.
  const { data: tokenRow } = await admin
    .from('signer_tokens')
    .select('id, staff_id, completed_at, is_qa')
    .eq('id', tokenId)
    .eq('submission_id', id)
    .maybeSingle();

  if (!tokenRow) return redirect(`${backTo}?error=not_found`, 303);
  if (tokenRow.completed_at) return redirect(`${backTo}?error=already_signed_row`, 303);

  const { data: target } = await admin
    .from('staff')
    .select('id, full_name, email')
    .eq('id', tokenRow.staff_id)
    .maybeSingle();
  if (!target) return redirect(`${backTo}?error=unknown`, 303);

  // Mint a fresh raw + hash and rotate on the existing row.
  const { raw, hash } = mintToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updErr } = await admin
    .from('signer_tokens')
    .update({
      token_hash: hash,
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
      reminder_count: (await getCurrentReminders(admin, tokenId)) + 1,
      last_reminded_at: new Date().toISOString(),
    })
    .eq('id', tokenId);

  if (updErr) {
    console.error('regenerate: update failed', updErr);
    return redirect(`${backTo}?error=unknown`, 303);
  }

  // Pick the primary role for the email badge from any of this token's signer rows.
  const { data: rowForRole } = await admin
    .from('signers')
    .select('role')
    .eq('signer_token_id', tokenId)
    .limit(1)
    .maybeSingle();
  const primaryRole = rowForRole?.role ?? (tokenRow.is_qa ? 'qa_verifier' : 'participant');

  const url = signerUrl(raw);

  const emailResult = await sendSignerInvite({
    toEmail: target.email,
    toName: target.full_name,
    role: primaryRole,
    submission: {
      id: submission.id,
      form_date: submission.form_date,
      product_name: submission.product_name,
      product_type: submission.product_type,
      initiator_name: (submission.initiator as any)?.full_name ?? '',
    },
    signerUrl: url,
    expiresAt,
  });

  await supabase.from('audit_log').insert({
    submission_id: id,
    actor_email: staff.email,
    action: 'signer_link_regenerated',
    ip_address: readIp(request),
    user_agent: request.headers.get('user-agent'),
    metadata: {
      signer_token_id: tokenId,
      target_staff_id: target.id,
      email_status: emailResult.status,
    },
  });

  // Redirect with the URL exposed so the creator can copy it (short-lived flash).
  // The detail page strips these params from the browser URL via history.replaceState.
  const qs = new URLSearchParams({
    reveal_token_id: tokenId,
    reveal_url: url,
    reveal_for: target.full_name,
    reveal_email_status: emailResult.status,
  });
  return redirect(`${backTo}?${qs.toString()}`, 303);
};

async function getCurrentReminders(admin: ReturnType<typeof getAdminClient>, tokenId: string): Promise<number> {
  const { data } = await admin.from('signer_tokens').select('reminder_count').eq('id', tokenId).maybeSingle();
  return data?.reminder_count ?? 0;
}
