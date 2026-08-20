import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { finalizeIfNeeded } from '../../../../../lib/finalize';

export const prerender = false;

// Re-send the finalized R&D email to the distribution list. Idempotency check
// is inside finalizeIfNeeded (returns early if already emailed), so we clear
// the prior audit_log entry first when the creator explicitly asks for a re-send.
export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail/formulaires');

  // Guard: creator only, status must be finalized.
  const { data: sub } = await supabase
    .from('submissions')
    .select('id, status, created_by_email')
    .eq('id', id)
    .maybeSingle();
  if (!sub) return redirect('/portail/formulaires?error=not_found', 303);
  if (sub.created_by_email !== staff.email) {
    return redirect(`/portail/demande/${id}?error=not_creator`, 303);
  }
  if (sub.status !== 'finalized') {
    return redirect(`/portail/demande/${id}?error=not_finalized`, 303);
  }

  // Clear prior finalized_email_sent audit entries so finalizeIfNeeded doesn't skip.
  const admin = getAdminClient();
  await admin
    .from('audit_log')
    .delete()
    .eq('submission_id', id)
    .eq('action', 'finalized_email_sent');

  await finalizeIfNeeded(id);

  return redirect(`/portail/demande/${id}?info=resent`, 303);
};
