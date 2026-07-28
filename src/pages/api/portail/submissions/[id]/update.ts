import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { storagePathFor } from '../../../../../lib/pdf';

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
  if (!id) return redirect('/portail');

  // Load current submission to check ownership + status.
  const { data: sub } = await supabase
    .from('submissions')
    .select('id, created_by_email, status')
    .eq('id', id)
    .maybeSingle();
  if (!sub) return redirect('/portail?error=not_found', 303);
  if (sub.created_by_email !== staff.email) {
    return redirect(`/portail/demande/${id}?error=not_creator`, 303);
  }

  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? '').trim();

  const form_date = get('form_date');
  const production_staff_id = get('production_staff_id');
  const product_name = get('product_name');
  const product_type = get('product_type');
  const quantity = get('quantity');
  const rnd_objective = get('rnd_objective') || null;
  const production_state = get('production_state') || null;
  const production_id = get('production_id') || null;

  const participants = form.getAll('participants').map(String).filter(Boolean);

  if (!form_date || !production_staff_id || !product_name || !product_type || !quantity) {
    return redirect(`/portail/demande/${id}/editer?error=missing`, 303);
  }
  if (participants.length === 0) {
    return redirect(`/portail/demande/${id}/editer?error=no_participants`, 303);
  }

  const admin = getAdminClient();

  // Re-lookup Jorge + Stephane in case IDs changed (they shouldn't, but keep
  // parity with the create endpoint).
  const { data: fixedRoles } = await admin
    .from('staff')
    .select('id, email')
    .in('email', ['jorge@oaziz.ca', 'stephane@oaziz.ca']);
  const jorgeId = fixedRoles?.find((r) => r.email === 'jorge@oaziz.ca')?.id;
  const stephaneId = fixedRoles?.find((r) => r.email === 'stephane@oaziz.ca')?.id;
  if (!jorgeId || !stephaneId) {
    return redirect(`/portail/demande/${id}/editer?error=unknown`, 303);
  }

  // Wipe everything downstream from this submission so re-sending starts clean:
  //   signer_tokens (cascade → signers), documents rows, storage PDF.
  await admin.from('signer_tokens').delete().eq('submission_id', id);
  await admin.from('documents').delete().eq('submission_id', id);
  try {
    await admin.storage.from('documents').remove([storagePathFor(id)]);
  } catch (e) {
    console.warn('[update] storage cleanup failed:', e);
  }

  // Update submission fields + reset to draft, clear lifecycle timestamps.
  const { error: updErr } = await admin
    .from('submissions')
    .update({
      status: 'draft',
      sent_at: null,
      finalized_at: null,
      form_date,
      initiator_staff_id: jorgeId,
      production_staff_id,
      qa_staff_id: stephaneId,
      consent_obtainer_staff_id: jorgeId,
      product_name,
      product_type,
      quantity,
      rnd_objective,
      production_state: production_state as 'vrac' | 'emballe' | null,
      production_id,
    })
    .eq('id', id);
  if (updErr) {
    console.error('[update] submission update failed:', updErr);
    return redirect(`/portail/demande/${id}/editer?error=unknown`, 303);
  }

  // Replace participants list. Also wipes any collected ratings/comments —
  // acceptable since the underlying R&D data changed.
  await admin.from('submission_participants').delete().eq('submission_id', id);
  const { error: partErr } = await admin
    .from('submission_participants')
    .insert(participants.map((pid) => ({ submission_id: id, participant_staff_id: pid })));
  if (partErr) {
    console.error('[update] participants insert failed:', partErr);
    return redirect(`/portail/demande/${id}/editer?error=unknown`, 303);
  }

  await supabase.from('audit_log').insert({
    submission_id: id,
    actor_email: staff.email,
    action: 'submission_edited',
    ip_address: readIp(request),
    user_agent: request.headers.get('user-agent'),
    metadata: {
      previous_status: sub.status,
      participant_count: participants.length,
    },
  });

  return redirect(`/portail/demande/${id}?info=edited`, 303);
};
