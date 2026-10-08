import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { effectivePermissions } from '../../../../../lib/access';
import { invitePortalUser } from '../../../../../lib/portal-invite';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');
  if (!effectivePermissions(staff).has('admin')) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const fullName = String(form.get('full_name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const title = String(form.get('title') ?? '').trim() || null;

  const base = '/portail/admin/utilisateurs';
  if (!fullName || !email) return redirect(`${base}?error=missing`, 303);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect(`${base}?error=invalid_email`, 303);

  const admin = getAdminClient();
  const { data: existing } = await admin.from('staff').select('id').eq('email', email).maybeSingle();
  if (existing) return redirect(`${base}?error=duplicate`, 303);

  const { data: inserted, error } = await admin
    .from('staff')
    .insert({ full_name: fullName, email, title, portal_role: null, portal_permission_overrides: {} })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[admin/users/create] insert failed:', error);
    return redirect(`${base}?error=unknown`, 303);
  }

  await admin.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'portal_user_created',
    metadata: { staff_id: inserted.id, email },
  });

  // Invitation email goes out right away unless the box was unticked.
  if (form.get('send_invite') === '1') {
    const sent = await invitePortalUser(admin, inserted.id, staff.email);
    return redirect(`${base}?info=${sent ? 'created_invited' : 'created&error=invite_failed'}#u-${inserted.id}`, 303);
  }
  return redirect(`${base}?info=created#u-${inserted.id}`, 303);
};
