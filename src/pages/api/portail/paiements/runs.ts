import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { createRun } from '../../../../lib/payables';

export const prerender = false;

// Start a new weekly payment run.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const form = await request.formData();
  const runDate = String(form.get('run_date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) return redirect('/portail/paiements?start=1', 303);
  // One run per week: never two runs with the same date.
  const admin = getAdminClient();
  const { data: same } = await admin.from('ap_runs').select('id').eq('run_date', runDate).limit(1);
  if (same?.length) {
    return redirect(`/portail/paiements?start=1&error=${encodeURIComponent(`Une semaine du ${runDate} existe déjà — choisissez le vendredi suivant.`)}`, 303);
  }
  try {
    const id = await createRun(admin, staff.id, runDate);
    return redirect(`/portail/paiements/semaine/${id}`, 303);
  } catch (e) {
    console.error('[paiements] create run failed:', e);
    return redirect('/portail/paiements?start=1&error=create', 303);
  }
};
