import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');

  if (!email || !password) {
    return redirect('/portail/connexion?error=missing', 303);
  }

  // Pre-check the staff roster with the admin client — the anon SSR client
  // has no read access to staff before authentication.
  const admin = getAdminClient();
  const { data: staff, error: staffErr } = await admin
    .from('staff')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle();

  if (staffErr) {
    console.error('[login] staff lookup failed:', staffErr);
    return redirect('/portail/connexion?error=db', 303);
  }
  if (!staff) {
    return redirect('/portail/connexion?error=not_staff', 303);
  }
  if (!staff.is_active) {
    return redirect('/portail/connexion?error=inactive', 303);
  }

  const supabase = createServerClient(request, cookies);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Distinguish "no auth account yet" from "wrong password" via admin lookup.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const authExists = list?.users?.some((u) => (u.email ?? '').toLowerCase() === email);
    if (!authExists) {
      return redirect('/portail/connexion?error=no_account', 303);
    }
    return redirect('/portail/connexion?error=invalid', 303);
  }

  return redirect('/portail', 303);
};
