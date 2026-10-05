import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';

export const prerender = false;

// Plan a destruction. Nothing moves yet: the lots are added next, QA approves,
// and only ops_complete_destruction() writes any movement.

function str(form: FormData, k: string): string | null {
  const v = String(form.get(k) ?? '').trim();
  return v === '' ? null : v;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const back = '/portail/atelier/destructions/nouvelle';

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier/destructions?error=no_role', 303);

  const form = await request.formData();
  const method = str(form, 'method');
  const reason = str(form, 'reason');
  if (!method || !reason) return redirect(`${back}?error=missing`, 303);

  const { data, error } = await supabase
    .from('ops_destructions')
    .insert({
      method,
      method_detail: str(form, 'method_detail'),
      reason,
      planned_for: str(form, 'planned_for'),
      notes: str(form, 'notes'),
      created_by: staff.email,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[atelier] destruction insert failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }

  return redirect(`/portail/atelier/destructions/${data.id}?ok=created`, 303);
};
