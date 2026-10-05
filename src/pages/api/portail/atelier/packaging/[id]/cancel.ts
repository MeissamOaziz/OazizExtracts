import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Cancel a packaging run that has not been closed yet. A closed run has already
// moved material, so the database refuses to cancel it — the way back from there
// is an adjustment on the lots, which keeps the history intact.

export const POST: APIRoute = async ({ request, cookies, redirect, params }) => {
  const runId = String(params.id ?? '');
  const back = `/portail/atelier/emballage/${runId}`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) return redirect(`${back}?error=reason`, 303);

  const { error } = await supabase.rpc('ops_cancel_packaging_run', {
    p_run: runId,
    p_reason: reason,
  });

  if (error) {
    console.error('[atelier] cancel packaging run failed:', error);
    const msg = (error.message ?? '').replace(/^.*?:\s*/, '').trim();
    return redirect(`${back}?error=rule&msg=${encodeURIComponent(msg)}`, 303);
  }

  return redirect('/portail/atelier/emballage?ok=cancelled', 303);
};
