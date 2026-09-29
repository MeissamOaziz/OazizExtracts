import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';

export const prerender = false;

// Each of the five required approvers can only approve their OWN row — this
// is what makes the record usable as individual, named proof of review for
// a Health Canada audit, rather than a single shared "approved" flag.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail/fournisseurs');

  const admin = getAdminClient();
  const { data: approval } = await admin
    .from('vendor_submission_approvals')
    .select('id, approved_at')
    .eq('vendor_submission_id', id)
    .eq('staff_id', staff.id)
    .maybeSingle();

  if (!approval) {
    return redirect(`/portail/fournisseurs/${id}?error=not_approver`, 303);
  }

  if (!approval.approved_at) {
    const { error } = await admin
      .from('vendor_submission_approvals')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', approval.id);
    if (error) {
      console.error('[vendor-approve] update failed:', error);
      return redirect(`/portail/fournisseurs/${id}?error=unknown`, 303);
    }
  }

  return redirect(`/portail/fournisseurs/${id}?info=approved`, 303);
};
