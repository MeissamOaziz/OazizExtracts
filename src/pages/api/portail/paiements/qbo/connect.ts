import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { createServerClient, currentStaff } from '../../../../../lib/supabase';
import { authorizeUrl, qboConfig } from '../../../../../lib/qbo';

export const prerender = false;

// Start the Intuit OAuth flow. The state value is kept in a short-lived
// httpOnly cookie and checked on the callback (CSRF protection).
export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  if (!qboConfig().configured) return redirect('/portail/paiements/quickbooks?error=not_configured', 303);
  const state = randomBytes(16).toString('hex');
  cookies.set('qbo_oauth_state', state, { path: '/api/portail/paiements/qbo', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', maxAge: 600 });
  return redirect(authorizeUrl(state), 302);
};
