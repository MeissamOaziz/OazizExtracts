import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { storagePathFor } from '../../../../../lib/pdf';

export const prerender = false;

export const POST: APIRoute = async ({ params, cookies, redirect, request }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail/formulaires');

  // Clean up any finalized PDF in Storage (RLS-guarded delete on the row alone
  // would orphan it). Ignore errors — the row delete is authoritative.
  try {
    const admin = getAdminClient();
    await admin.storage.from('documents').remove([storagePathFor(id)]);
  } catch (e) {
    console.warn('[delete] storage cleanup failed:', e);
  }

  // RLS enforces "creator only" — no need to double-check here.
  const { error } = await supabase.from('submissions').delete().eq('id', id);
  if (error) {
    console.error('delete failed:', error);
    return redirect(`/portail/demande/${id}?error=delete`, 303);
  }

  await supabase.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'submission_deleted',
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: request.headers.get('user-agent'),
    metadata: { submission_id: id },
  });

  return redirect('/portail/formulaires?info=deleted', 303);
};
