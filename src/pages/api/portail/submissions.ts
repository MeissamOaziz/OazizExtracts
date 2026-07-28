import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../lib/supabase';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null
  );
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

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
    return redirect('/portail/nouvelle?error=missing', 303);
  }
  if (participants.length === 0) {
    return redirect('/portail/nouvelle?error=no_participants', 303);
  }

  // Server-side enforcement: initiator + consent_obtainer are always Jorge,
  // QA is always Stephane. Look up by email so we don't have to hardcode IDs.
  const admin = getAdminClient();
  const { data: fixedRoles } = await admin
    .from('staff')
    .select('id, email')
    .in('email', ['jorge@oaziz.ca', 'stephane@oaziz.ca']);
  const jorgeId = fixedRoles?.find((r) => r.email === 'jorge@oaziz.ca')?.id;
  const stephaneId = fixedRoles?.find((r) => r.email === 'stephane@oaziz.ca')?.id;
  if (!jorgeId) return redirect('/portail/nouvelle?error=no_jorge', 303);
  if (!stephaneId) return redirect('/portail/nouvelle?error=no_stephane', 303);

  const { data: created, error } = await supabase
    .from('submissions')
    .insert({
      created_by_email: staff.email,
      status: 'draft',
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
    .select('id')
    .single();

  if (error || !created) {
    console.error('submission insert failed:', error);
    return redirect('/portail/nouvelle?error=unknown', 303);
  }

  const { error: partErr } = await supabase
    .from('submission_participants')
    .insert(
      participants.map((pid) => ({
        submission_id: created.id,
        participant_staff_id: pid,
      })),
    );

  if (partErr) {
    console.error('participants insert failed:', partErr);
    return redirect('/portail/nouvelle?error=unknown', 303);
  }

  await supabase.from('audit_log').insert({
    submission_id: created.id,
    actor_email: staff.email,
    action: 'draft_saved',
    ip_address: readIp(request),
    user_agent: request.headers.get('user-agent'),
    metadata: { participant_count: participants.length },
  });

  return redirect(`/portail/demande/${created.id}`, 303);
};
