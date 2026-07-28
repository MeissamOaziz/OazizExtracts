import type { APIRoute } from 'astro';
import { createServerClient, currentStaff } from '../../../lib/supabase';

export const prerender = false;

const BANNED_PASSWORDS = new Set([
  '1234567890', 'qwertyuiop', 'password12', 'letmein123', 'motdepasse',
  '0987654321', 'welcome123', 'oazizportail', 'abcdef1234',
]);

function redirectWithDetail(dest: string, code: string, detail?: string): Response {
  const qs = new URLSearchParams({ error: code });
  if (detail) qs.set('detail', detail.slice(0, 200));
  return new Response(null, {
    status: 303,
    headers: { Location: `${dest}?${qs.toString()}` },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) {
    return new Response(null, { status: 303, headers: { Location: '/portail/connexion?error=no_session' } });
  }

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  const dest = '/portail/definir-mot-de-passe';

  if (password.length < 8) return redirectWithDetail(dest, 'short');
  if (password !== confirm) return redirectWithDetail(dest, 'mismatch');
  if (BANNED_PASSWORDS.has(password.toLowerCase())) return redirectWithDetail(dest, 'weak');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[set-password] updateUser failed:', {
      code: (error as any).code,
      status: (error as any).status,
      message: error.message,
    });
    // Supabase's leaked-password / complexity checks all surface as weak_password.
    const errCode = (error as any).code as string | undefined;
    const isWeak = errCode === 'weak_password'
      || /weak|pwned|leaked|compromised|breach|common|dictionary|previously used/i.test(error.message ?? '');
    if (isWeak) {
      return redirectWithDetail(dest, 'weak', error.message);
    }
    return redirectWithDetail(dest, 'unknown', error.message);
  }

  await supabase.from('audit_log').insert({
    submission_id: null,
    actor_email: staff.email,
    action: 'password_set',
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: request.headers.get('user-agent'),
  });

  return new Response(null, { status: 303, headers: { Location: '/portail' } });
};
