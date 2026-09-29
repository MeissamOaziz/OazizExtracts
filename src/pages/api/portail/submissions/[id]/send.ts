import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { dispatchSignatureInvites } from '../../../../../lib/send-signatures';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail/formulaires');

  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('id, status, created_by_email')
    .eq('id', id)
    .maybeSingle();
  if (subErr || !submission) return redirect(`/portail/demande/${id}?error=not_found`, 303);
  if (submission.created_by_email !== staff.email) {
    return redirect(`/portail/demande/${id}?error=not_creator`, 303);
  }
  if (submission.status !== 'draft') {
    return redirect(`/portail/demande/${id}?error=already_sent`, 303);
  }

  // Clean up any orphan signer_tokens from a prior failed send (they'd violate
  // the (submission_id, staff_id) unique constraint on retry). Safe because we
  // already asserted status='draft'. Cascades to signers rows.
  const admin = getAdminClient();
  await admin.from('signer_tokens').delete().eq('submission_id', id);

  const result = await dispatchSignatureInvites(id);
  if (!result.ok) {
    return redirect(`/portail/demande/${id}?error=${result.error}`, 303);
  }

  await supabase.from('audit_log').insert({
    submission_id: id,
    actor_email: staff.email,
    action: 'sent_for_signature',
    ip_address: readIp(request),
    user_agent: request.headers.get('user-agent'),
    metadata: { token_count: result.tokenCount },
  });

  return redirect(`/portail/demande/${id}?info=sent`, 303);
};
