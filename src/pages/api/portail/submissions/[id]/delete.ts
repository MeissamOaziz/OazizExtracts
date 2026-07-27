import type { APIRoute } from 'astro';
import { createServerClient, currentStaff } from '../../../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ params, cookies, redirect, request }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail');

  // RLS enforces "only creator + only draft" — no need to double-check here.
  const { error } = await supabase.from('submissions').delete().eq('id', id);
  if (error) {
    console.error('delete failed:', error);
    return redirect(`/portail/demande/${id}?error=delete`, 303);
  }

  await supabase.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'draft_deleted',
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: request.headers.get('user-agent'),
    metadata: { submission_id: id },
  });

  return redirect('/portail', 303);
};
