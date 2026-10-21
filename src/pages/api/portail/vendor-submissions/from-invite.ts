import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import type { Permission } from '../../../../lib/access';
import { inviteRecipients } from '../../../../lib/vendor-invites';

export const prerender = false;

// Opens a vendor's file from their invitation so Oaziz can fill it in for them
// (they sent documents by email instead of completing the form). The file is a
// draft tied to the invitation: the vendor's own link opens the same file.
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const perms: ReadonlySet<Permission> = locals.access?.perms ?? new Set<Permission>();
  if (!perms.has('vq')) return redirect('/portail/fournisseurs?error=forbidden', 303);

  const form = await request.formData();
  const inviteId = String(form.get('invite_id') ?? '');
  const company = String(form.get('company_name') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(inviteId) || !company) return redirect('/portail/fournisseurs?error=company_required', 303);

  const admin = getAdminClient();
  const { data: invite } = await admin.from('vendor_invites')
    .select('id, email, recipients, vendor_submission_id').eq('id', inviteId).maybeSingle();
  if (!invite) return redirect('/portail/fournisseurs', 303);
  if (invite.vendor_submission_id) return redirect(`/portail/fournisseurs/${invite.vendor_submission_id}/modifier`, 303);

  const { data: created, error } = await admin.from('vendor_submissions')
    .insert({ company_name: company, email: inviteRecipients(invite)[0] ?? invite.email, status: 'draft' })
    .select('id').single();
  if (error || !created) {
    console.error('[vq-staff] create from invite failed:', error);
    return redirect('/portail/fournisseurs?error=unknown', 303);
  }
  await admin.from('vendor_invites').update({ vendor_submission_id: created.id }).eq('id', invite.id).is('vendor_submission_id', null);
  await admin.from('vendor_submission_events').insert({
    vendor_submission_id: created.id, staff_id: staff.id, decision: 'staff_edited', note: 'Dossier ouvert par Oaziz pour le fournisseur.',
  });
  return redirect(`/portail/fournisseurs/${created.id}/modifier`, 303);
};
