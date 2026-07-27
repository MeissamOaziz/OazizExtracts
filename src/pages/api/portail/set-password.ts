import type { APIRoute } from 'astro';
import { createServerClient, currentStaff } from '../../../lib/supabase';

export const prerender = false;

// Very common passwords we won't accept. Leaked-password protection on Supabase
// covers the deep list; this is a low-effort guard for the very worst.
const BANNED_PASSWORDS = new Set([
  '1234567890', 'qwertyuiop', 'password12', 'letmein123', 'motdepasse',
  '0987654321', 'welcome123', 'oazizportail', 'abcdef1234',
]);

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion?error=no_session', 303);

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  if (password.length < 10) return redirect('/portail/definir-mot-de-passe?error=short', 303);
  if (password !== confirm) return redirect('/portail/definir-mot-de-passe?error=mismatch', 303);
  if (BANNED_PASSWORDS.has(password.toLowerCase())) {
    return redirect('/portail/definir-mot-de-passe?error=weak', 303);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase's leaked-password check (if enabled) surfaces here.
    if (/pwned|leaked|compromised|weak/i.test(error.message ?? '')) {
      return redirect('/portail/definir-mot-de-passe?error=weak', 303);
    }
    console.error('[set-password] updateUser failed:', error);
    return redirect('/portail/definir-mot-de-passe?error=unknown', 303);
  }

  await supabase.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'password_set',
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: request.headers.get('user-agent'),
  });

  return redirect('/portail', 303);
};
